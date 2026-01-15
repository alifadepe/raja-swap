'use client'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'

const ConnectButton = dynamic(
  () => import('@xellar/kit').then((mod) => mod.ConnectButton),
  { ssr: false }
)

export function Navbar() {
  return (
    <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Image
            src="/raja-swap-long.png"
            alt="RajaSwap"
            width={200}
            height={40}
            className="h-8 w-auto object-contain"
          />
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/market" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">
            Market
          </Link>
          <Link href="/create" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">
            Create Order
          </Link>
          <Link href="/faucet" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">
            Faucet
          </Link>

          <ConnectButton />
        </div>
      </div>
    </nav>
  )
}
