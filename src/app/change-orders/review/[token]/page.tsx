import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { InvalidActionTokenError, peekActionToken } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";

import { ChangeOrderReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

/**
 * Public, no-login Change Order review — client e-sign approve / decline.
 * Token is peeked on load; Approve/Decline redeem it (single-use).
 * Never touches QuickBooks.
 */
export default async function ChangeOrderReviewPage({ params }: PageProps<"/change-orders/review/[token]">) {
  const { token } = await params;

  let resolved: { clientId: string; changeOrderId: string } | null = null;
  let invalidMessage: string | null = null;
  try {
    const { clientId, resourceId } = await peekActionToken(token, ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL, undefined, {
      allowUsed: true,
    });
    if (!resourceId) throw new InvalidActionTokenError();
    resolved = { clientId, changeOrderId: resourceId };
  } catch (error) {
    if (error instanceof InvalidActionTokenError) {
      invalidMessage = error.message;
    } else {
      throw error;
    }
  }

  if (!resolved) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 bg-[#f3f4f6] p-6 text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Link no longer valid</h1>
        <p className="text-sm text-[#555]">{invalidMessage}</p>
      </div>
    );
  }

  const changeOrder = await db.changeOrder.findUnique({
    where: { id: resolved.changeOrderId },
    include: {
      lineItems: {
        include: { costCode: { select: { code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      job: { select: { name: true, addressLine1: true, city: true, state: true, postalCode: true } },
      organization: {
        select: {
          name: true,
          logoPath: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
    },
  });

  if (!changeOrder) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 bg-[#f3f4f6] p-6 text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Link no longer valid</h1>
        <p className="text-sm text-[#555]">This change order could not be found.</p>
      </div>
    );
  }

  const access = await db.clientJobAccess.findFirst({
    where: { clientId: resolved.clientId, jobId: changeOrder.jobId },
    select: { id: true },
  });
  if (!access) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 bg-[#f3f4f6] p-6 text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Link no longer valid</h1>
        <p className="text-sm text-[#555]">This link does not match the job for this change order.</p>
      </div>
    );
  }

  const coNumber = String(changeOrder.number).padStart(4, "0");
  const clientPrice =
    changeOrder.mode === "FLAT"
      ? (changeOrder.flatClientPriceCents ?? 0)
      : changeOrder.lineItems.reduce(
          (sum, item) =>
            sum + priceWithRate(extendedCostCents(item.quantityMilli, item.unitCostCents), item.rateMode, item.rateBasisPoints),
          0,
        );

  const alreadyDecided = changeOrder.status === "APPROVED" || changeOrder.status === "DECLINED";
  const jobAddress = [changeOrder.job.addressLine1, changeOrder.job.city, changeOrder.job.state, changeOrder.job.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-8">
      <article className="mx-auto max-w-3xl rounded-lg border bg-white px-4 py-6 shadow-sm sm:px-10 sm:py-10" style={{ borderColor: "#e5e7eb" }}>
        <header className="flex flex-col items-center gap-2 text-center">
          <OutboundBrandMark organizationLogoPath={changeOrder.organization.logoPath ?? null} className="h-14 w-auto max-w-[14rem] object-contain sm:h-16" />
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">{changeOrder.organization.name}</div>
        </header>

        <div className="mt-6 border-t border-[#e5e7eb] pt-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Change Order</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1a1a1a]">
            {changeOrder.title} <span className="text-[#6b7280]">#{coNumber}</span>
          </h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            {changeOrder.job.name}
            {jobAddress ? ` · ${jobAddress}` : ""}
          </p>
        </div>

        {changeOrder.lineItems.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded border" style={{ borderColor: "#e5e7eb" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-[#f9fafb] text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]" style={{ borderColor: "#e5e7eb" }}>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {changeOrder.lineItems.map((line) => {
                  const amount = priceWithRate(
                    extendedCostCents(line.quantityMilli, line.unitCostCents),
                    line.rateMode,
                    line.rateBasisPoints,
                  );
                  return (
                    <tr key={line.id} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                      <td className="px-3 py-2">
                        <div className="text-[#1a1a1a]">{line.title}</div>
                        <div className="text-xs text-[#6b7280]">
                          {line.costCode.code} — {line.costCode.name}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(amount)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-[#f9fafb] font-semibold" style={{ borderColor: "#e5e7eb" }}>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(clientPrice)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded border px-3 py-4 text-sm" style={{ borderColor: "#e5e7eb" }}>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(clientPrice)}</span>
            </div>
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-[#1a1a1a]">Scope of Work</h2>
          {changeOrder.notesClient ? (
            changeOrder.notesClient.includes("<") ? (
              <div className="prose prose-sm mt-2 max-w-none text-[#374151]" dangerouslySetInnerHTML={{ __html: changeOrder.notesClient }} />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">{changeOrder.notesClient}</p>
            )
          ) : (
            <p className="mt-2 text-sm italic text-[#9ca3af]">No scope notes.</p>
          )}
        </section>

        <section className="mt-8 border-t pt-6" style={{ borderColor: "#e5e7eb" }}>
          <ChangeOrderReviewActions token={token} alreadyDecided={alreadyDecided} status={changeOrder.status} />
        </section>
      </article>
    </div>
  );
}
