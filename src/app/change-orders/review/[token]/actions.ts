"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import {
  approveChangeOrder,
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  declineChangeOrder,
  EmptyChangeOrderError,
  IncompleteFlatChangeOrderError,
} from "@/lib/change-orders/service";
import { InvalidActionTokenError, peekActionToken, redeemActionToken } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly declined?: boolean;
}

async function resolveChangeOrderForToken(token: string) {
  const { clientId, resourceId: changeOrderId } = await peekActionToken(
    token,
    ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL,
  );
  if (!changeOrderId) throw new InvalidActionTokenError();

  const changeOrder = await db.changeOrder.findUnique({
    where: { id: changeOrderId },
    select: { organizationId: true, jobId: true },
  });
  if (!changeOrder) throw new ChangeOrderNotFoundError(changeOrderId);

  const access = await db.clientJobAccess.findFirst({
    where: { clientId, jobId: changeOrder.jobId },
    select: { id: true },
  });
  if (!access) throw new InvalidActionTokenError();

  return { changeOrderId, organizationId: changeOrder.organizationId };
}

function clientIpFromHeaders(headerList: Headers): string | undefined {
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

export async function approveChangeOrderReviewAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const clientSignatureName = String(formData.get("clientSignatureName") ?? "").trim() || undefined;
  const headerList = await headers();

  try {
    const { changeOrderId, organizationId } = await resolveChangeOrderForToken(token);
    await redeemActionToken(token, ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL, changeOrderId, () =>
      approveChangeOrder({
        organizationId,
        changeOrderId,
        clientSignatureName,
        clientSignatureIp: clientIpFromHeaders(headerList),
      }),
    );
  } catch (error) {
    if (
      error instanceof InvalidActionTokenError ||
      error instanceof ChangeOrderNotFoundError ||
      error instanceof ChangeOrderNotPendingError ||
      error instanceof EmptyChangeOrderError ||
      error instanceof IncompleteFlatChangeOrderError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/change-orders/review/${token}`);
  return { ok: true };
}

export async function declineChangeOrderReviewAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");

  try {
    const { changeOrderId, organizationId } = await resolveChangeOrderForToken(token);
    await redeemActionToken(token, ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL, changeOrderId, () =>
      declineChangeOrder(organizationId, changeOrderId),
    );
  } catch (error) {
    if (
      error instanceof InvalidActionTokenError ||
      error instanceof ChangeOrderNotFoundError ||
      error instanceof ChangeOrderNotPendingError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/change-orders/review/${token}`);
  return { ok: true, declined: true };
}
