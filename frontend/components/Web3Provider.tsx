'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { defaultConfig, XellarKitProvider } from '@xellar/kit'
import { WagmiProvider, http } from 'wagmi'
import { mantleSepoliaTestnet } from 'wagmi/chains'
import { ReactNode, useState } from 'react'
import { NetworkGuard } from './NetworkGuard'

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID!
const xellarAppId = process.env.NEXT_PUBLIC_XELLAR_APP_ID!

export const config = defaultConfig({
  appName: 'RajaSwap',
  walletConnectProjectId: projectId,
  xellarAppId: xellarAppId,
  chains: [mantleSepoliaTestnet],
  transports: {
    [mantleSepoliaTestnet.id]: http(),
  },
})

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <XellarKitProvider>
          <NetworkGuard>
            {children}
          </NetworkGuard>
        </XellarKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
