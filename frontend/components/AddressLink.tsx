import { ExternalLink } from 'lucide-react'

interface AddressLinkProps {
  address: string
  className?: string
  shorten?: boolean
}

export function AddressLink({ address, className = "", shorten = true }: AddressLinkProps) {
  if (!address) return null

  const displayAddress = shorten
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address

  return (
    <a
      href={`https://sepolia.mantlescan.xyz/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 hover:text-blue-400 transition-colors ${className}`}
      title={address}
    >
      <span className="font-mono">{displayAddress}</span>
      <ExternalLink size={12} className="opacity-50" />
    </a>
  )
}
