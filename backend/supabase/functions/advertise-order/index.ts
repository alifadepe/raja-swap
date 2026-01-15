import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createPublicClient, http, formatEther } from 'npm:viem'
import { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RPC_URL = Deno.env.get('MANTLE_SEPOLIA_RPC_URL') ?? ''
const CLIENT = createPublicClient({
  transport: http(RPC_URL)
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { orderId, txHash } = await req.json()

    if (!orderId || !txHash) {
      throw new Error("Missing orderId or txHash")
    }

    // 1. Verify Transaction Status and Recipient
    const txReceipt = await CLIENT.getTransactionReceipt({ hash: txHash as `0x${string}` })

    if (txReceipt.status !== 'success') {
      throw new Error("Transaction failed on-chain")
    }

    const contractAddress = Deno.env.get('RAJA_SWAP_CONTRACT_ADDRESS')
    if (!contractAddress) throw new Error("Missing RAJA_SWAP_CONTRACT_ADDRESS")

    if (txReceipt.to?.toLowerCase() !== contractAddress.toLowerCase()) {
      throw new Error("Transaction is not for RajaSwap contract")
    }

    // 2. Get Transaction Value (Fee Paid)
    const tx = await CLIENT.getTransaction({ hash: txHash as `0x${string}` })
    const feePaid = formatEther(tx.value)

    // 3. Update Database
    const { error } = await supabase
      .from('order')
      .update({ adsFee: Number(feePaid) })
      .eq('id', orderId)

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, feePaid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
