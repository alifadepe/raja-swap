export interface Token {
  chainId: number
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
}

export const VERIFIED_TOKENS: Token[] = [
  {
    chainId: 5003,
    address: '0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  {
    chainId: 5003,
    address: '0x36e2F9e6a7E63010d5fB5Bfe55034b0D1b0dD77F',
    symbol: 'TUSD',
    name: 'Test USD',
    decimals: 18,
  },
  {
    chainId: 5003,
    address: '0x4F4A23fc2608E7E48BFdA5f79ce6e57bA5EA5404',
    symbol: 'tNVDA',
    name: 'Test NVDIA',
    decimals: 18,
  },
]

export const getSymbol = (address: string) => {
  const t = VERIFIED_TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())
  return t ? t.symbol : `${address.slice(0, 6)}...`
}

export const getName = (address: string) => {
  const t = VERIFIED_TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())
  return t ? t.name : `${address.slice(0, 6)}...`
}

export const isVerified = (address: string) => {
  return VERIFIED_TOKENS.some(t => t.address.toLowerCase() === address.toLowerCase())
}
