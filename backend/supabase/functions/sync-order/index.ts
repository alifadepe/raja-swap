import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createPublicClient, http, hashTypedData, getAddress, Hex } from 'npm:viem'
import { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RPC_URL = Deno.env.get('MANTLE_SEPOLIA_RPC_URL') ?? ''
const RAJA_SWAP_CONTRACT_ADDRESS = Deno.env.get('RAJA_SWAP_CONTRACT_ADDRESS') as Hex

const CLIENT = createPublicClient({
  transport: http(RPC_URL)
})

const RAJA_SWAP_ABI = [
  {
    "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "name": "filledAmount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" },
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "_nonceCancelled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { orderId } = await req.json()

    if (!orderId) {
      throw new Error("Missing orderId")
    }

    // 1. Fetch Order
    const { data: order, error: fetchError } = await supabase
      .from('order')
      .select('*')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      throw new Error("Order not found")
    }

    // 2. Calculate Order Hash
    // Normalize logic same as frontend/contract
    const deadlineSeconds = order.deadline ? Math.floor(new Date(order.deadline).getTime() / 1000) : 0

    const domain = {
      name: 'RajaSwap',
      version: '1',
      chainId: 5003, // Mantle Sepolia
      verifyingContract: RAJA_SWAP_CONTRACT_ADDRESS,
    } as const

    const types = {
      Order: [
        { name: 'maker', type: 'address' },
        { name: 'tokenSell', type: 'address' },
        { name: 'amountSell', type: 'uint256' },
        { name: 'tokenBuy', type: 'address' },
        { name: 'amountBuy', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'desiredTaker', type: 'address' }
      ]
    } as const

    const message = {
      maker: getAddress(order.maker),
      tokenSell: getAddress(order.tokenSell),
      amountSell: BigInt(order.amountSell),
      tokenBuy: getAddress(order.tokenBuy),
      amountBuy: BigInt(order.amountBuy),
      nonce: BigInt(order.nonce),
      deadline: BigInt(deadlineSeconds),
      desiredTaker: order.desiredTaker ? getAddress(order.desiredTaker) : '0x0000000000000000000000000000000000000000'
    }

    const orderHash = hashTypedData({
      domain,
      types,
      primaryType: 'Order',
      message
    })

    // 3. Fetch Contract State
    const [filledAmount, isCancelled] = await Promise.all([
      CLIENT.readContract({
        address: RAJA_SWAP_CONTRACT_ADDRESS,
        abi: RAJA_SWAP_ABI,
        functionName: 'filledAmount',
        args: [orderHash]
      }),
      CLIENT.readContract({
        address: RAJA_SWAP_CONTRACT_ADDRESS,
        abi: RAJA_SWAP_ABI,
        functionName: '_nonceCancelled',
        args: [getAddress(order.maker), BigInt(order.nonce)]
      })
    ])

    // 4. Determine Status
    let status: 'active' | 'filled' | 'canceled' = 'active'

    if (isCancelled) {
      status = 'canceled'
    } else if (filledAmount >= BigInt(order.amountBuy)) {
      status = 'filled'
    }

    // 5. Update Database
    const { error: updateError } = await supabase
      .from('order')
      .update({
        amountBuyFilled: filledAmount.toString(),
        status
      })
      .eq('id', orderId)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true, status, filledAmount: filledAmount.toString() }),
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
