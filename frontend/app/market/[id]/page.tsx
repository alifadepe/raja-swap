'use client'

import { useState, useEffect, use } from 'react'
import { Navbar } from '@/components/Navbar'
import { AddressLink } from '@/components/AddressLink'
import { useAccount, useWriteContract, usePublicClient, useReadContracts } from 'wagmi'
import { erc20Abi, formatUnits, hashTypedData, parseEther } from 'viem'
import { Loader2, ArrowRight, Wallet, Check, AlertTriangle, BadgeCheck, XCircle, Megaphone } from 'lucide-react'
import { RAJA_SWAP_ABI } from '@/lib/abi'
import { RAJA_SWAP_CONTRACT_ADDRESS } from '@/config/contracts'
import { supabase } from '@/lib/supabase'
import { getSymbol, getName, isVerified } from '@/config/tokens'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import confetti from 'canvas-confetti'
import { DOMAIN, TYPES } from '@/config/eip712'
import { useReadContract } from 'wagmi'
import { formatNumber, formatDate } from '@/lib/utils'

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const router = useRouter()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'approving' | 'filling' | 'cancelling' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [fillTxHash, setFillTxHash] = useState<`0x${string}` | null>(null)
  const [orderHash, setOrderHash] = useState<`0x${string}` | null>(null)
  const [showAdModal, setShowAdModal] = useState(false)
  const [adFeeInput, setAdFeeInput] = useState('')
  const [fillAmountInput, setFillAmountInput] = useState('')

  // Fetch Order from DB
  useEffect(() => {
    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from('order')
        .select('*')
        .eq('id', id)
        .single()

      if (data) {
        setOrder(data)
        // Calculate hash strictly typed
        try {
          const deadlineSeconds = data.deadline ? Math.floor(new Date(data.deadline).getTime() / 1000) : 0

          const message = {
            maker: data.maker,
            tokenSell: data.tokenSell,
            amountSell: BigInt(data.amountSell),
            tokenBuy: data.tokenBuy,
            amountBuy: BigInt(data.amountBuy),
            nonce: BigInt(data.nonce),
            deadline: BigInt(deadlineSeconds),
            desiredTaker: data.desiredTaker || '0x0000000000000000000000000000000000000000'
          }

          const hash = hashTypedData({
            domain: DOMAIN,
            types: TYPES,
            primaryType: 'Order',
            message
          })
          setOrderHash(hash)
        } catch (e) { console.error("Hash err", e) }
      } else {
        setErrorMsg("Order not found")
      }
      setLoading(false)
    }
    fetchOrder()
  }, [id])

  // Check On-Chain Status
  const { data: isFilled, isLoading: isCheckingStatus } = useReadContract({
    address: RAJA_SWAP_CONTRACT_ADDRESS,
    abi: RAJA_SWAP_ABI,
    functionName: 'isOrderFilled',
    args: orderHash ? [orderHash] : undefined,
    query: {
      enabled: !!orderHash
    }
  })

  // Check Cancellation Status
  const { data: isCancelled, isLoading: isCheckingCancelStatus } = useReadContract({
    address: RAJA_SWAP_CONTRACT_ADDRESS,
    abi: RAJA_SWAP_ABI,
    functionName: '_nonceCancelled',
    args: order ? [order.maker as `0x${string}`, BigInt(order.nonce)] : undefined,
    query: {
      enabled: !!order
    }
  })

  // Read Min Ad Fee
  const { data: minAdFee } = useReadContract({
    address: RAJA_SWAP_CONTRACT_ADDRESS,
    abi: RAJA_SWAP_ABI,
    functionName: 'minAdFee'
  })

  // Read Filled Amount
  const { data: filledAmount } = useReadContract({
    address: RAJA_SWAP_CONTRACT_ADDRESS,
    abi: RAJA_SWAP_ABI,
    functionName: 'filledAmount',
    args: orderHash ? [orderHash] : undefined,
    query: {
      enabled: !!orderHash
    }
  })

  // Fetch Token Symbols for Unverified Tokens
  const { data: tokenMetadata } = useReadContracts({
    contracts: [
      {
        address: order?.tokenBuy as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol'
      },
      {
        address: order?.tokenSell as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol'
      },
      {
        address: order?.tokenBuy as `0x${string}`,
        abi: erc20Abi,
        functionName: 'name'
      },
      {
        address: order?.tokenSell as `0x${string}`,
        abi: erc20Abi,
        functionName: 'name'
      }
    ],
    query: {
      enabled: !!order
    }
  })

  // Auto-Sync Order Status (silent background sync for DB consistency)
  useEffect(() => {
    const syncOrder = async () => {
      const isDbActive = !order?.status || order.status === 'active'
      const isChainDifferent = isFilled || isCancelled

      if (order && order.id && isDbActive && isChainDifferent && !isCheckingStatus && !isCheckingCancelStatus) {
        console.log("Status mismatch detected. Syncing DB...", { db: order.status, filled: isFilled, cancelled: isCancelled })

        try {
          await supabase.functions.invoke('sync-order', {
            body: { orderId: order.id }
          })
        } catch (e) {
          console.error("Auto-sync failed", e)
        }
      }
    }

    syncOrder()
  }, [order, isFilled, isCancelled, isCheckingStatus, isCheckingCancelStatus])

  const tokenBuySymbol = isVerified(order?.tokenBuy || '') ? getSymbol(order?.tokenBuy || '') : (tokenMetadata?.[0]?.result as string || getSymbol(order?.tokenBuy || ''))
  const tokenSellSymbol = isVerified(order?.tokenSell || '') ? getSymbol(order?.tokenSell || '') : (tokenMetadata?.[1]?.result as string || getSymbol(order?.tokenSell || ''))

  const tokenBuyName = isVerified(order?.tokenBuy || '') ? getName(order?.tokenBuy || '') : (tokenMetadata?.[2]?.result as string || getName(order?.tokenBuy || ''))
  const tokenSellName = isVerified(order?.tokenSell || '') ? getName(order?.tokenSell || '') : (tokenMetadata?.[3]?.result as string || getName(order?.tokenSell || ''))


  const handleFill = async () => {
    if (!order || !address || !publicClient) return
    try {
      setStatus('approving')
      setErrorMsg('')

      // 1. Check Allowance
      const allowance = await publicClient.readContract({
        address: order.tokenBuy as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, RAJA_SWAP_CONTRACT_ADDRESS]
      })

      const amountBuyBigInt = BigInt(order.amountBuy)

      if (allowance < amountBuyBigInt) {
        await writeContractAsync({
          address: order.tokenBuy as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [RAJA_SWAP_CONTRACT_ADDRESS, amountBuyBigInt]
        })
      }

      setStatus('filling')

      // Calculate fill amount
      const remainingAmount = BigInt(order.amountBuy) - (filledAmount as bigint || BigInt(0))
      const fillAmount = fillAmountInput ? parseEther(fillAmountInput) : remainingAmount

      // 2. Fill Order
      const hash = await writeContractAsync({
        address: RAJA_SWAP_CONTRACT_ADDRESS,
        abi: RAJA_SWAP_ABI,
        functionName: 'fillOrder',
        args: [
          {
            maker: order.maker,
            tokenSell: order.tokenSell,
            amountSell: BigInt(order.amountSell),
            tokenBuy: order.tokenBuy,
            amountBuy: BigInt(order.amountBuy),
            nonce: BigInt(order.nonce),
            deadline: BigInt(order.deadline === '0' || !order.deadline ? 0 : Math.floor(new Date(order.deadline).getTime() / 1000)),
            desiredTaker: order.desiredTaker || '0x0000000000000000000000000000000000000000'
          },
          order.signature,
          fillAmount
        ]
      })

      setFillTxHash(hash)

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      })

      setStatus('success')
    } catch (error: any) {
      console.error(error)
      setErrorMsg(error.message || "Transaction failed")
      setStatus('error')
    }
  }

  const handleAdvertise = async () => {
    if (!order || !minAdFee || !address) return
    try {
      setStatus('approving')
      setErrorMsg('')

      // Use user input or default to minAdFee
      const fee = adFeeInput ? parseEther(adFeeInput) : (minAdFee as bigint)

      const hash = await writeContractAsync({
        address: RAJA_SWAP_CONTRACT_ADDRESS,
        abi: RAJA_SWAP_ABI,
        functionName: 'advertiseOrder',
        args: [
          {
            maker: order.maker,
            tokenSell: order.tokenSell,
            amountSell: BigInt(order.amountSell),
            tokenBuy: order.tokenBuy,
            amountBuy: BigInt(order.amountBuy),
            nonce: BigInt(order.nonce),
            deadline: BigInt(order.deadline === '0' || !order.deadline ? 0 : Math.floor(new Date(order.deadline).getTime() / 1000)),
            desiredTaker: order.desiredTaker || '0x0000000000000000000000000000000000000000'
          }
        ],
        value: fee as bigint
      })

      setFillTxHash(hash)

      // Call backend to update database
      try {
        await supabase.functions.invoke('advertise-order', {
          body: { orderId: order.id, txHash: hash }
        })
      } catch (e) {
        console.error("Backend update failed", e)
      }

      setShowAdModal(false)
      setStatus('success')
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#FBBF24', '#D97706'] // Gold colors
      })
    } catch (error: any) {
      setShowAdModal(false)
      console.error(error)
      setErrorMsg(error.message || "Advertisement failed")
      setStatus('error')
    }
  }

  const handleCancel = async () => {
    if (!order || !address) return
    try {
      setStatus('cancelling')
      setErrorMsg('')

      const hash = await writeContractAsync({
        address: RAJA_SWAP_CONTRACT_ADDRESS,
        abi: RAJA_SWAP_ABI,
        functionName: 'cancelOrder',
        args: [BigInt(order.nonce)]
      })

      setFillTxHash(hash)
      setStatus('success')
    } catch (error: any) {
      console.error(error)
      setErrorMsg(error.message || "Cancellation failed")
      setStatus('error')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-500" size={48} />
    </div>
  )

  if (!order) return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Navbar />
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-red-500 mb-4">{errorMsg || "Order not found"}</h1>
        <Link href="/market" className="text-blue-400 hover:underline">Back to Market</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Navbar />

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <Link href="/market" className="mb-8 text-slate-400 hover:text-white transition-colors flex items-center gap-2 w-fit">
          &larr; Back to Market
        </Link>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Wallet size={200} />
          </div>

          <div className="relative z-10">
            <h1 className="text-2xl font-bold mb-8 text-center text-slate-200">Swap Details</h1>

            {order.adsFee && (
              <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center gap-2 text-amber-400 text-sm animate-in fade-in">
                <Megaphone size={16} />
                <span className="font-medium">Promoted Order</span>
              </div>
            )}

            {(() => {
              const unverifiedLabels: string[] = []
              if (!isVerified(order.tokenSell)) unverifiedLabels.push(`${tokenSellName} (${tokenSellSymbol})`)
              if (!isVerified(order.tokenBuy)) unverifiedLabels.push(`${tokenBuyName} (${tokenBuySymbol})`)

              if (unverifiedLabels.length > 0) {
                return (
                  <div className="mb-6 p-4 bg-yellow-950/30 border border-yellow-900/50 rounded-xl flex items-start gap-3 text-yellow-400 text-sm animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                    <p>
                      <span className="font-bold">Warning:</span> Unverified token{unverifiedLabels.length > 1 ? 's' : ''} detected: <span className="font-bold text-yellow-300">{unverifiedLabels.join(' & ')}</span>.
                      Always verify the contract address on the explorer before swapping.
                    </p>
                  </div>
                )
              }
              return null
            })()}

            <div className="flex flex-col gap-6">
              <div className="bg-slate-950/50 rounded-2xl p-6 border border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm font-medium">You Pay</span>
                  <a
                    href={`https://sepolia.mantlescan.xyz/token/${order.tokenBuy}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-blue-400 transition-colors text-xs font-mono hover:underline"
                  >
                    {order.tokenBuy}
                  </a>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-blue-400">
                    {formatNumber(formatUnits(BigInt(order.amountBuy), 18))}
                  </span>
                  <a
                    href={`https://sepolia.mantlescan.xyz/token/${order.tokenBuy}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xl font-bold text-blue-400 flex items-center gap-1 hover:text-blue-300 transition-colors hover:underline decoration-blue-400/50"
                  >
                    {tokenBuySymbol}
                    {isVerified(order.tokenBuy) && <BadgeCheck size={18} className="text-blue-500" />}
                  </a>
                </div>
              </div>

              <div className="flex justify-center -my-3 z-20">
                <div className="bg-slate-800 p-2 rounded-full border-4 border-slate-900">
                  <ArrowRight className="text-slate-400" />
                </div>
              </div>

              <div className="bg-slate-950/50 rounded-2xl p-6 border border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm font-medium">You Receive</span>
                  <a
                    href={`https://sepolia.mantlescan.xyz/token/${order.tokenSell}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-blue-400 transition-colors text-xs font-mono hover:underline"
                  >
                    {order.tokenSell}
                  </a>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-green-400">
                    {formatNumber(formatUnits(BigInt(order.amountSell), 18))}
                  </span>
                  <a
                    href={`https://sepolia.mantlescan.xyz/token/${order.tokenSell}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xl font-bold text-green-500 flex items-center gap-1 hover:text-green-400 transition-colors hover:underline decoration-green-500/50"
                  >
                    {tokenSellSymbol}
                    {isVerified(order.tokenSell) && <BadgeCheck size={18} className="text-green-500" />}
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-2 gap-y-4 text-sm text-slate-400">
              <div>Maker</div>
              <div className="text-right flex justify-end">
                <AddressLink address={order.maker} className="text-slate-300" />
              </div>

              {order.desiredTaker && order.desiredTaker !== '0x0000000000000000000000000000000000000000' && (
                <>
                  <div className="text-yellow-500">Desired Taker</div>
                  <div className="text-right flex justify-end">
                    <AddressLink address={order.desiredTaker} className="text-yellow-500" />
                  </div>
                </>
              )}

              <div>Expires</div>
              <div className="text-right text-slate-300">{formatDate(order.deadline)}</div>

              <div>Status</div>
              <div className="text-right">
                {isCheckingStatus ? (
                  <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs border border-slate-700 flex items-center gap-1 justify-end ml-auto w-fit">
                    <Loader2 size={10} className="animate-spin" /> Verifying...
                  </span>
                ) : isFilled ? (
                  <span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded text-xs border border-green-900/50">Filled</span>
                ) : isCancelled ? (
                  <span className="bg-red-900/30 text-red-400 px-2 py-0.5 rounded text-xs border border-red-900/50">Cancelled</span>
                ) : (
                  <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded text-xs border border-blue-900/50">Open</span>
                )}
              </div>

              {filledAmount !== undefined && BigInt(order.amountBuy) > 0n && (
                <>
                  <div>Filled</div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-300">
                        {formatNumber(formatUnits(filledAmount as bigint, 18))} / {formatNumber(formatUnits(BigInt(order.amountBuy), 18))}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({((Number(filledAmount) / Number(order.amountBuy)) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.min((Number(filledAmount) / Number(order.amountBuy)) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {errorMsg && (
              <div className="mt-6 p-4 bg-red-950/30 border border-red-900/50 rounded-xl flex items-start gap-3 text-red-400 text-sm">
                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                <p>{errorMsg}</p>
              </div>
            )}

            {order && address && order.maker.toLowerCase() === address.toLowerCase() && !isFilled && !isCancelled ? (
              <div className="flex flex-col gap-3 mt-8">
                {!order.adsFee && !fillTxHash && (
                  <button
                    onClick={() => { setAdFeeInput(minAdFee ? formatUnits(minAdFee as bigint, 18) : ''); setShowAdModal(true) }}
                    disabled={status !== 'idle' && status !== 'error' || isCheckingStatus || isCheckingCancelStatus}
                    className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-500 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {status === 'approving' ? <Loader2 className="animate-spin" /> : <Megaphone size={18} />}
                    Advertise Order
                  </button>
                )}
                <button
                  onClick={handleCancel}
                  disabled={status !== 'idle' && status !== 'error' || isCheckingStatus || isCheckingCancelStatus}
                  className="w-full bg-red-600/10 hover:bg-red-600/20 border border-red-600/50 text-red-500 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {status === 'cancelling' ? <><Loader2 className="animate-spin" /> Cancelling...</> : <><XCircle size={20} /> Cancel Order</>}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-8">
                {/* Fill Amount Input */}
                {!isFilled && !isCancelled && (
                  <div className="mb-2">
                    <label className="block text-slate-400 text-sm mb-2">Amount to Fill ({tokenBuySymbol})</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.000001"
                        value={fillAmountInput}
                        onChange={(e) => setFillAmountInput(e.target.value)}
                        placeholder={filledAmount !== undefined
                          ? formatUnits(BigInt(order.amountBuy) - (filledAmount as bigint), 18)
                          : formatUnits(BigInt(order.amountBuy), 18)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors pr-16"
                      />
                      <button
                        type="button"
                        onClick={() => setFillAmountInput(
                          filledAmount !== undefined
                            ? formatUnits(BigInt(order.amountBuy) - (filledAmount as bigint), 18)
                            : formatUnits(BigInt(order.amountBuy), 18)
                        )}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300"
                      >
                        MAX
                      </button>
                    </div>
                    <p className="text-slate-500 text-xs mt-1">
                      Remaining: {filledAmount !== undefined
                        ? formatNumber(formatUnits(BigInt(order.amountBuy) - (filledAmount as bigint), 18))
                        : formatNumber(formatUnits(BigInt(order.amountBuy), 18))} {tokenBuySymbol}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleFill}
                  disabled={status !== 'idle' && status !== 'error' || Boolean(isFilled) || Boolean(isCancelled) || isCheckingStatus || isCheckingCancelStatus || (order.maker.toLowerCase() === address?.toLowerCase())}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-green-500/20 flex items-center justify-center gap-2 transform active:scale-[0.98]"
                >
                  {isCheckingStatus ? <><Loader2 className="animate-spin" /> Verifying Status...</> : isFilled ? 'Order Filled' : isCancelled ? 'Order Cancelled' : (
                    <>
                      {status === 'approving' && <><Loader2 className="animate-spin" /> Processing...</>}
                      {status === 'filling' && <><Loader2 className="animate-spin" /> Confirming Swap...</>}
                      {status === 'success' ? <><Check /> Transaction Submitted!</> : 'Confirm Swap'}
                    </>
                  )}
                </button>
              </div>
            )}

            {status === 'success' && fillTxHash && (
              <div className="mt-6 text-center animate-in fade-in slide-in-from-bottom-4">
                <p className="text-slate-400 mb-2 text-sm">Transaction Submitted</p>
                <a
                  href={`https://sepolia.mantlescan.xyz/tx/${fillTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/30 px-4 py-2 rounded-lg border border-blue-900/50 hover:border-blue-700 font-mono text-sm"
                >
                  {fillTxHash.slice(0, 6)}...{fillTxHash.slice(-4)}
                  <ArrowRight size={14} className="-rotate-45" />
                </a>
              </div>
            )}
          </div>
        </div>
      </main >

      {/* Advertise Modal */}
      {showAdModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Megaphone size={22} className="text-amber-500" />
              Advertise Order
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Pay a fee in MNT to promote your order. Higher fees may get more visibility.
            </p>
            <div className="mb-4">
              <label className="block text-slate-400 text-sm mb-2">Ad Fee (MNT)</label>
              <input
                type="number"
                step="0.01"
                min={minAdFee ? formatUnits(minAdFee as bigint, 18) : '0'}
                value={adFeeInput}
                onChange={(e) => setAdFeeInput(e.target.value)}
                placeholder={minAdFee ? formatUnits(minAdFee as bigint, 18) : '5'}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
              <p className="text-slate-500 text-xs mt-2">
                Minimum: {minAdFee ? formatUnits(minAdFee as bigint, 18) : '...'} MNT
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAdModal(false)}
                disabled={status === 'approving'}
                className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 font-medium py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdvertise}
                disabled={status === 'approving' || !adFeeInput || parseFloat(adFeeInput) < parseFloat(minAdFee ? formatUnits(minAdFee as bigint, 18) : '0')}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {status === 'approving' ? <><Loader2 className="animate-spin" size={18} /> Processing...</> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  )
}
