'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '@/components/Navbar'
import { formatUnits } from 'viem'
import { Loader2, ShoppingBag, BadgeCheck, Lock, Megaphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { isVerified } from '@/config/tokens'
import { formatNumber, formatDate } from '@/lib/utils'

export default function MarketPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from('order')
        .select(`
          *,
          tokenSell:token!order_tokenSell_fkey (*),
          tokenBuy:token!order_tokenBuy_fkey (*)
        `)
        .order('adsFee', { ascending: false, nullsFirst: false })

      if (!error && data) {
        setOrders(data)
      }
      setLoading(false)
    }

    fetchOrders()

    // Realtime subscription
    const channel = supabase
      .channel('public:order')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order' }, payload => {
        fetchOrders()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Navbar />

      <main className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Marketplace</h1>
          <Link href="/create" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl transition-colors font-medium">
            Create Order
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-blue-500" size={40} />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
            <ShoppingBag size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">No active orders found.</p>
            <Link href="/create" className="text-blue-400 hover:text-blue-300 mt-2 inline-block">Be the first to create one!</Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50">
            <div className="min-w-[768px]">
              <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr] bg-slate-900/80 text-xs uppercase font-semibold text-slate-300 border-b border-slate-800">
                <div className="px-6 py-4">You Pay</div>
                <div className="px-6 py-4">You Receive</div>
                <div className="px-6 py-4">Maker</div>
                <div className="px-6 py-4">Expires</div>
              </div>
              <div className="divide-y divide-slate-800">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/market/${order.id}`}
                    className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr] hover:bg-slate-800/30 transition-colors group"
                  >
                    <div className="px-6 py-4 flex items-center">
                      <div className="flex items-center gap-3">
                        {order.adsFee && (
                          <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center" title="Promoted Order">
                            <Megaphone size={12} className="text-amber-500" />
                          </div>
                        )}
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                          {(order.tokenBuy as any)?.symbol?.slice(0, 1) || '?'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200 flex items-center gap-1">
                            {formatNumber(formatUnits(BigInt(order.amountBuy), (order.tokenBuy as any)?.decimals || 18))}
                            {" "}
                            {(order.tokenBuy as any)?.symbol || '???'}
                            {(order.tokenBuy as any)?.id && isVerified((order.tokenBuy as any).id) && <BadgeCheck size={14} className="text-blue-500" />}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="px-6 py-4 flex items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                          {(order.tokenSell as any)?.symbol?.slice(0, 1) || '?'}
                        </div>
                        <div>
                          <div className="font-semibold text-green-400 flex items-center gap-1">
                            {formatNumber(formatUnits(BigInt(order.amountSell), (order.tokenSell as any)?.decimals || 18))}
                            {" "}
                            {(order.tokenSell as any)?.symbol || '???'}
                            {(order.tokenSell as any)?.id && isVerified((order.tokenSell as any).id) && <BadgeCheck size={14} className="text-green-500" />}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="px-6 py-4 flex items-center font-mono text-slate-400">
                      {order.desiredTaker && order.desiredTaker !== '0x0000000000000000000000000000000000000000' ? (
                        <div className="flex items-center gap-2 text-yellow-500 bg-yellow-900/10 px-2 py-1 rounded border border-yellow-900/30 w-fit">
                          <Lock size={12} />
                          <span className="text-xs font-sans font-medium">Private Order</span>
                        </div>
                      ) : (
                        <>{order.maker.slice(0, 6)}...{order.maker.slice(-4)}</>
                      )}
                    </div>
                    <div className="px-6 py-4 flex items-center">
                      <div className="flex flex-col gap-1">
                        <span>{formatDate(order.deadline)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
