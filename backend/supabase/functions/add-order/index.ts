import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyTypedData, createPublicClient, http, erc20Abi, Hex, getAddress } from 'npm:viem'
import { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RPC_URL = Deno.env.get('MANTLE_SEPOLIA_RPC_URL') ?? ''

const publicClient = createPublicClient({
  transport: http(RPC_URL)
})

async function fetchAndSaveToken(supabase: any, tokenAddress: string) {
  // 1. Check if token exists in DB
  const { data: existingToken } = await supabase
    .from('token')
    .select('id')
    .eq('id', tokenAddress)
    .single()

  if (existingToken) return

  try {
    console.log(`Fetching metadata for new token: ${tokenAddress}`)
    // 2. Fetch metadata from contract
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress as Hex,
        abi: erc20Abi,
        functionName: 'name'
      }),
      publicClient.readContract({
        address: tokenAddress as Hex,
        abi: erc20Abi,
        functionName: 'symbol'
      }),
      publicClient.readContract({
        address: tokenAddress as Hex,
        abi: erc20Abi,
        functionName: 'decimals'
      })
    ])

    // 3. Save to DB
    const { error } = await supabase
      .from('token')
      .insert({
        id: tokenAddress,
        name,
        symbol,
        decimals
      })

    if (error) {
      // Ignore unique constraint violation (race condition)
      if (error.code !== '23505') {
        console.error('Error saving token:', error)
      }
    } else {
      console.log(`Saved token: ${symbol} (${tokenAddress})`)
    }
  } catch (error) {
    console.error(`Failed to fetch/save token ${tokenAddress}:`, error)
    // Foreign key constraint might fail if token is not in 'token' table.
    // So we MUST insert something or fail.
    throw new Error(`Failed to resolve token ${tokenAddress}. Is it a valid ERC20?`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const {
      maker: _maker,
      tokenSell: _tokenSell,
      amountSell,
      tokenBuy: _tokenBuy,
      amountBuy,
      nonce,
      deadline,
      desiredTaker: _desiredTaker,
      signature
    } = body

    // Normalize addresses (Checksum) to ensure DB consistency
    const maker = getAddress(_maker)
    const tokenSell = getAddress(_tokenSell)
    const tokenBuy = getAddress(_tokenBuy)
    const desiredTaker = _desiredTaker ? getAddress(_desiredTaker) : null

    // Validate numeric inputs
    try {
      BigInt(amountSell)
      BigInt(amountBuy)
      BigInt(nonce)
      BigInt(deadline)
    } catch (e) {
      throw new Error("Invalid numeric format for amount, nonce, or deadline")
    }

    // 1. Verify Signature
    const contractAddress = Deno.env.get('RAJA_SWAP_CONTRACT_ADDRESS') as `0x${string}`
    if (!contractAddress) {
      console.error("Missing RAJA_SWAP_CONTRACT_ADDRESS environment variable")
      throw new Error("Server Misconfiguration: Missing RAJA_SWAP_CONTRACT_ADDRESS")
    }

    const domain = {
      name: 'RajaSwap',
      version: '1',
      chainId: 5003, // Mantle Sepolia
      verifyingContract: contractAddress,
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
      maker,
      tokenSell,
      amountSell: BigInt(amountSell),
      tokenBuy,
      amountBuy: BigInt(amountBuy),
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
      desiredTaker: desiredTaker || '0x0000000000000000000000000000000000000000'
    }

    const valid = await verifyTypedData({
      address: maker,
      domain,
      types,
      primaryType: 'Order',
      message,
      signature
    })

    if (!valid) {
      console.error(`Signature Verification Failed.
        Expected Maker: ${maker}
        Verifying Contract: ${contractAddress}
        Domain: ${JSON.stringify(domain)}
        Message: ${JSON.stringify(message, (_, v) => typeof v === 'bigint' ? v.toString() : v)}
      `)
      throw new Error(`Invalid signature. Check server logs. Contract: ${contractAddress}`)
    }

    // 2. Ensure Tokens Exist in DB
    await Promise.all([
      fetchAndSaveToken(supabase, tokenSell),
      fetchAndSaveToken(supabase, tokenBuy)
    ])

    // 3. Insert into 'order' table
    // Convert Unix timestamp (seconds) to Date object for Postgres timestamptz
    const payload = {
      maker,
      tokenSell,
      amountSell,
      tokenBuy,
      amountBuy,
      nonce,
      desiredTaker,
      signature,
      deadline: (!deadline || deadline === "0" || Number(deadline) === 0) ? null : new Date(Number(deadline) * 1000).toISOString()
    }

    const { data: insertedOrder, error } = await supabase
      .from('order')
      .insert(payload)
      .select('id')
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({ id: insertedOrder.id }),
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
