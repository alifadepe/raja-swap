'use client'

import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { useAccount, useSignTypedData, useWriteContract, usePublicClient, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits, zeroAddress, formatUnits } from 'viem'
import { ArrowUpDown, Loader2, Check, AlertCircle } from 'lucide-react'
import { VERIFIED_TOKENS } from '@/config/tokens'
import { RAJA_SWAP_CONTRACT_ADDRESS } from '@/config/contracts'
import { RAJA_SWAP_ABI } from '@/lib/abi'
import { supabase } from '@/lib/supabase'
import confetti from 'canvas-confetti'
import { DOMAIN, TYPES } from '@/config/eip712'
import { CreateSuccessModal } from '@/components/CreateSuccessModal'
import { formatNumber } from '@/lib/utils'

const now = Date.now()

export default function CreateOrder() {
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  const { data: feeBps } = useReadContract({
    address: RAJA_SWAP_CONTRACT_ADDRESS,
    abi: RAJA_SWAP_ABI,
    functionName: 'feeBps'
  })

  const [formData, setFormData] = useState({
    tokenSell: '',
    amountSell: '',
    tokenBuy: '',
    amountBuy: '',
    desiredTaker: '',
    deadline: new Date(now + 7 * 24 * 60 * 60 * 1000 - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
  })

  const [status, setStatus] = useState<'idle' | 'approving' | 'signing' | 'success' | 'error'>('idle')
  const [createdOrder, setCreatedOrder] = useState<any>(null)
  const [balance, setBalance] = useState<string>("")
  const [maxBalance, setMaxBalance] = useState<number>(0)
  const [isFetchingBalance, setIsFetchingBalance] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchBalance = (tokenAddress: string) => {
    if (!tokenAddress || !address || !publicClient) return setBalance("")

    setIsFetchingBalance(true)
    publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address]
    }).then(async (bal) => {
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals'
      })

      const formatted = formatUnits(bal as bigint, decimals as number)
      const formattedNum = Number(formatted)
      setBalance(formattedNum.toLocaleString(undefined, { maximumFractionDigits: 4 }))
      setMaxBalance(formattedNum)
    }).catch(() => {
      setBalance("")
      setMaxBalance(0)
    })
      .finally(() => setIsFetchingBalance(false))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address || !publicClient) return

    try {
      const sellValue = parseFloat(formData.amountSell)
      if (isNaN(sellValue) || sellValue <= 0) {
        alert("Amount to sell must be greater than 0")
        return
      }
      if (sellValue > maxBalance) {
        alert("Insufficient balance")
        return
      }

      setStatus('approving')

      // 1. Approve Token Sell - Check allowance first
      const [decimalsSell, decimalsBuy, allowance] = await Promise.all([
        publicClient.readContract({
          address: formData.tokenSell as `0x${string}`,
          abi: erc20Abi,
          functionName: 'decimals'
        }),
        publicClient.readContract({
          address: formData.tokenBuy as `0x${string}`,
          abi: erc20Abi,
          functionName: 'decimals'
        }),
        publicClient.readContract({
          address: formData.tokenSell as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, RAJA_SWAP_CONTRACT_ADDRESS]
        })
      ])

      const amountSellParsed = parseUnits(formData.amountSell, decimalsSell)
      const amountBuyParsed = parseUnits(formData.amountBuy, decimalsBuy)

      if (allowance < amountSellParsed) {
        await writeContractAsync({
          address: formData.tokenSell as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [RAJA_SWAP_CONTRACT_ADDRESS, amountSellParsed]
        })
      }

      setStatus('signing')

      // 2. Sign Order
      const nonce = Math.floor(Date.now() / 1000)
      const deadline = formData.deadline ? Math.floor(new Date(formData.deadline).getTime() / 1000) : 0

      const message = {
        maker: address,
        tokenSell: formData.tokenSell as `0x${string}`,
        amountSell: amountSellParsed,
        tokenBuy: formData.tokenBuy as `0x${string}`,
        amountBuy: amountBuyParsed,
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
        desiredTaker: (formData.desiredTaker || zeroAddress) as `0x${string}`
      }

      const signature = await signTypedDataAsync({
        domain: DOMAIN,
        types: TYPES,
        primaryType: 'Order',
        message,
      })

      console.log("Order Signed:", { ...message, signature })

      // 3. Save to Supabase (Database)
      const payload = {
        ...message,
        signature,
        amountSell: message.amountSell.toString(),
        amountBuy: message.amountBuy.toString(),
        nonce: message.nonce.toString(),
        deadline: message.deadline.toString()
      }

      const { data, error } = await supabase.functions.invoke('add-order', {
        body: payload
      })

      if (error) {
        throw new Error(error.message || 'Failed to save order')
      }

      const orderData = data
      setCreatedOrder(orderData)

      confetti({
        particleCount: 150,
        spread: 60
      })

      setStatus('success')
      setIsModalOpen(true)

    } catch (error: any) {
      console.error(error)
      if (error?.message?.includes('User rejected')) {
        setStatus('idle')
      } else {
        setStatus('error')
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Navbar />

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <h1 className="text-3xl font-bold mb-8">Create New Order</h1>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleCreate} className="space-y-6">

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Token to Sell</label>
                <div className="flex flex-col gap-2">
                  <select
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    value={VERIFIED_TOKENS.find(t => t.address === formData.tokenSell)?.address || ""}
                    onChange={(e) => {
                      const addr = e.target.value
                      setFormData(prev => ({ ...prev, tokenSell: addr, amountSell: '' }))
                      fetchBalance(addr)
                    }}
                  >
                    <option value="">Select Verified Token / Manual</option>
                    {VERIFIED_TOKENS.map(t => (
                      <option key={t.address} value={t.address}>{t.symbol}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="0x... (Manual Address)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    value={formData.tokenSell}
                    onChange={e => setFormData({ ...formData, tokenSell: e.target.value })}
                    onBlur={() => fetchBalance(formData.tokenSell)}
                    required
                    disabled={VERIFIED_TOKENS.some(t => t.address === formData.tokenSell)}
                  />
                  {isFetchingBalance ? (
                    <div className="text-xs text-slate-400 text-right px-1 flex items-center justify-end gap-1">
                      <Loader2 className="animate-spin" size={12} />
                      <span>Fetching balance...</span>
                    </div>
                  ) : balance && (
                    <div className="text-xs text-slate-400 text-right px-1">
                      Balance: <span className="text-blue-400 font-medium">{balance}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Amount to Sell</label>
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.amountSell}
                  onChange={e => setFormData({ ...formData, amountSell: e.target.value })}
                  required
                  disabled={isFetchingBalance}
                />
              </div>
            </div>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  const newTokenSell = formData.tokenBuy
                  setFormData(prev => ({
                    ...prev,
                    tokenSell: prev.tokenBuy,
                    amountSell: prev.amountBuy,
                    tokenBuy: prev.tokenSell,
                    amountBuy: prev.amountSell
                  }))
                  fetchBalance(newTokenSell)
                }}
                className="p-3 bg-slate-800 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-all hover:scale-110 active:scale-95 border border-slate-700"
              >
                <ArrowUpDown size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Token to Buy</label>
                <div className="flex flex-col gap-2">
                  <select
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    value={VERIFIED_TOKENS.find(t => t.address === formData.tokenBuy)?.address || ""}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, tokenBuy: e.target.value }))
                    }}
                  >
                    <option value="">Select Verified Token / Manual</option>
                    {VERIFIED_TOKENS.map(t => (
                      <option key={t.address} value={t.address}>{t.symbol}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="0x... (Manual Address)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    value={formData.tokenBuy}
                    onChange={e => setFormData({ ...formData, tokenBuy: e.target.value })}
                    required
                    disabled={VERIFIED_TOKENS.some(t => t.address === formData.tokenBuy)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Amount to Receive</label>
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  value={formData.amountBuy}
                  onChange={e => setFormData({ ...formData, amountBuy: e.target.value })}
                  required
                />
                <div className="text-xs text-slate-500 px-1">
                  {feeBps !== undefined ? (
                    <>
                      <span className="text-yellow-500 font-medium">Fee: {Number(feeBps) / 100}%</span> (Deducted from received amount).
                      {formData.amountBuy && !isNaN(parseFloat(formData.amountBuy)) && (
                        <span className="block mt-1 text-slate-400">
                          You will receive: <span className="text-white font-medium">{(Number(formData.amountBuy) * (1 - Number(feeBps) / 10000)).toFixed(8)}</span>
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Fetching current fee...</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Desired Taker (Optional - Private Order)</label>
              <input
                type="text"
                placeholder="0x... (Leave empty for public)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                value={formData.desiredTaker}
                onChange={e => setFormData({ ...formData, desiredTaker: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Order Validity (Date & Time) <span className="text-slate-500">(Optional)</span></label>
              <input
                type="datetime-local"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors calendar-picker-indicator:invert cursor-pointer"
                value={formData.deadline}
                onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                onClick={(e) => e.currentTarget.showPicker()}
              />
            </div>

            <button
              disabled={status === 'approving' || status === 'signing' || status === 'success'}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
            >
              {status === 'approving' && <Loader2 className="animate-spin" />}
              {status === 'signing' && <Loader2 className="animate-spin" />}
              {status === 'success' ? <><Check /> Order Created!</> : (status === 'idle' || status === 'error' ? 'Sign & Create Order' : 'Processing...')}
            </button>

            {status === 'error' && (
              <div className="p-4 bg-red-950/50 border border-red-900 rounded-xl flex items-center gap-2 text-red-400">
                <AlertCircle size={20} />
                <span>Failed to create order. Check console.</span>
              </div>
            )}
          </form>
        </div>

        <CreateSuccessModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          orderId={createdOrder?.id}
        />
      </main>
    </div>
  )
}
