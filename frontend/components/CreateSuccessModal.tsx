import { CheckCircle, Copy, ExternalLink, X } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

interface CreateSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  orderId: string
}

export function CreateSuccessModal({ isOpen, onClose, orderId }: CreateSuccessModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const orderUrl = `${window.location.origin}/market/${orderId}`

  const handleCopy = () => {
    navigator.clipboard.writeText(orderUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mb-6">
            <CheckCircle size={32} className="text-green-500" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Order Created!</h2>
          <p className="text-slate-400 mb-8">
            Your OTC order has been successfully created and signed. Share the link below with your counterparty.
          </p>

          <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 flex items-center gap-3">
            <input
              type="text"
              readOnly
              value={orderUrl}
              className="bg-transparent text-slate-300 text-sm flex-1 focus:outline-none font-mono"
            />
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-blue-400 transition-colors"
              title="Copy Link"
            >
              {copied ? <span className="text-green-500 font-bold text-xs">Copied!</span> : <Copy size={18} />}
            </button>
          </div>

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors font-medium"
            >
              Close
            </button>
            <Link
              href={`/market/${orderId}`}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              View Order <ExternalLink size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
