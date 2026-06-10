import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-4xl flex flex-col lg:flex-row items-center gap-12 lg:gap-20 py-16">

        {/* ── Left: Illustration ── */}
        <div className="shrink-0 w-[280px] h-[280px] lg:w-[340px] lg:h-[340px]">
          <Image
            src="/404-illustration.svg"
            alt="404 - Page not found illustration"
            width={340}
            height={340}
            priority
            className="w-full h-full drop-shadow-xl"
          />
        </div>

        {/* ── Right: Content ── */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-6">

          {/* 404 badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <span className="font-mono text-xs font-bold text-primary tracking-widest">404</span>
            <span className="w-1 h-1 rounded-full bg-primary/40" />
            <span className="text-xs text-muted-foreground font-medium">Not Found</span>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
              Page not found.
            </h1>
            <p className="text-muted-foreground text-base lg:text-lg leading-relaxed max-w-md">
              The route you&apos;re looking for doesn&apos;t exist or has been moved.
              Double-check the URL or navigate back to the app.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Button asChild size="lg" className="gap-2 w-full sm:w-auto rounded-xl shadow-lg shadow-primary/20">
              <Link href="/items">
                <LayoutDashboard size={16} />
                Go to Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 w-full sm:w-auto rounded-xl">
              <Link href="/login">
                <ArrowLeft size={16} />
                Back to Login
              </Link>
            </Button>
          </div>

          {/* Brand footer */}
          <div className="flex items-center gap-2 pt-2 opacity-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon/icon_dark.svg" alt="" width={18} height={18} className="dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon/icon_light.svg" alt="" width={18} height={18} className="hidden dark:block" />
            <span className="text-xs font-semibold text-foreground tracking-wide">IOT BOM List</span>
          </div>
        </div>

      </div>
    </div>
  )
}
