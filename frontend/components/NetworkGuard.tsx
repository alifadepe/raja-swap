'use client'

import { useAccount, useSwitchChain } from 'wagmi'
import { mantleSepoliaTestnet } from 'wagmi/chains'
import { AlertCircle, ArrowRightLeft, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  // Hydration fix: only show after mount
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <>{children}</>

  if (isConnected && chainId !== mantleSepoliaTestnet.id) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl relative overflow-hidden">

          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />

          <div className="mx-auto w-16 h-16 bg-red-950/50 rounded-full flex items-center justify-center mb-6 border border-red-900">
            <AlertCircle size={32} className="text-red-500" />
          </div>

          <h2 className="text-2xl font-bold mb-3 text-white">Wrong Network</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            RajaSwap currently only operates on <strong className="text-slate-200">Mantle Sepolia</strong>.
            Please switch your network to continue.
          </p>

          <button
            onClick={() => switchChain({ chainId: mantleSepoliaTestnet.id })}
            disabled={isPending}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 active:scale-[0.98]"
          >
            {isPending ? (
              <><Loader2 className="animate-spin" /> Switching...</>
            ) : (
              <><ArrowRightLeft size={20} /> Switch to Mantle Sepolia</>
            )}
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
