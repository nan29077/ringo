import Link from "next/link";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[#faf9f6] px-4 py-14">
      <div className="w-full max-w-[440px] rounded-2xl border border-[#ebeae4] bg-white p-8 shadow-[0_20px_60px_#1c1d220d]">
        <Link href="/" className="brand mb-6 !text-[28px]"><img src="/favicon.svg" alt="" />ringo</Link>
        <h1 className="text-[26px] font-semibold tracking-tight text-[#1c1d22]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-[#6f716a]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-[#efeee9] pt-5 text-center text-sm text-[#6f716a]">{footer}</div>}
      </div>
    </main>
  );
}

export function AuthInput(props: React.ComponentProps<"input"> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-[#3b3d46]">{label}</span>
      <input {...rest} className="h-11 rounded-lg border border-[#dfdfd9] bg-white px-3.5 text-[15px] outline-none focus:border-[#ed4b2e] focus:ring-3 focus:ring-[#ed4b2e22]" />
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return <button type="submit" className="h-12 w-full rounded-lg bg-[#ed4b2e] text-[15px] font-semibold text-white transition hover:bg-[#d9401f] disabled:opacity-60">{children}</button>;
}
