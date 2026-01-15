'use client'

import { Navbar } from '@/components/Navbar'
import { useAccount, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { Loader2, Coins } from 'lucide-react'
import { MOCK_ERC20_ABI } from '@/lib/abi'
import { VERIFIED_TOKENS } from '@/config/tokens'
import { useState } from 'react'
import { Token } from '@/config/tokens'

export default function FaucetPage() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [minting, setMinting] = useState<string | null>(null)

  const TUSD = VERIFIED_TOKENS.find(t => t.symbol === 'TUSD')
  const TNVDIA = VERIFIED_TOKENS.find(t => t.symbol === 'tNVDA')

  const handleMint = async (token: Token) => {
    if (!address || !token) return
    try {
      setMinting(token.symbol)
      await writeContractAsync({
        address: token.address as `0x${string}`,
        abi: MOCK_ERC20_ABI,
        functionName: 'mint',
        args: [address, parseUnits('1000', token.decimals)]
      })
      alert(`Successfully minted 1000 ${token.symbol}!`)
    } catch (error) {
      console.error(error)
      alert("Failed to mint. See console.")
    } finally {
      setMinting(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Navbar />
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-4">Testnet Faucet</h1>
          <p className="text-slate-400">Mint 1000 tokens for testing RajaSwap on Mantle Sepolia.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TUSD && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-4 hover:border-blue-500/50 transition-colors">
              <a
                href={`https://sepolia.mantlescan.xyz/token/${TUSD.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-4 group"
              >
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <Coins size={32} />
                </div>
                <div className="text-center group-hover:text-blue-400 transition-colors">
                  <h3 className="font-bold text-xl flex items-center gap-1 justify-center">{TUSD.symbol}</h3>
                  <p className="text-sm text-slate-400">{TUSD.name}</p>
                </div>
              </a>
              <button
                onClick={() => handleMint(TUSD)}
                disabled={!!minting}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {minting === TUSD.symbol ? <Loader2 className="animate-spin" size={18} /> : 'Mint 1000'}
              </button>
            </div>
          )}

          {TNVDIA && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-4 hover:border-emerald-500/50 transition-colors">
              <a
                href={`https://sepolia.mantlescan.xyz/token/${TNVDIA.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-4 group"
              >
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <Coins size={32} />
                </div>
                <div className="text-center group-hover:text-emerald-400 transition-colors">
                  <h3 className="font-bold text-xl flex items-center gap-1 justify-center">{TNVDIA.symbol}</h3>
                  <p className="text-sm text-slate-400">{TNVDIA.name}</p>
                </div>
              </a>
              <button
                onClick={() => handleMint(TNVDIA)}
                disabled={!!minting}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {minting === TNVDIA.symbol ? <Loader2 className="animate-spin" size={18} /> : 'Mint 1000'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
