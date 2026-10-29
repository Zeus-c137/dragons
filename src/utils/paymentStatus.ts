export interface PaymentStatusResult {
  status?: string;
  error?: string;
  profile?: unknown;
  subscription?: unknown;
  transaction?: {
    id?: string;
    status?: string;
  };
  [key: string]: unknown;
}

function isRecord(value: unknown): value is PaymentStatusResult {
  return typeof value === "object" && value !== null;
}

export async function waitForPaymentResolution(
  transactionId: string,
  initialResult: PaymentStatusResult
): Promise<PaymentStatusResult> {
  let result = initialResult;
  let delay = 3000;

  while (true) {
    const status = String(result.status || "PENDING").toUpperCase();
    if (status === "SUCCESSFUL" || status === "FAILED") {
      return { ...result, status };
    }

    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 2000, 10000);

    let response: Response;
    try {
      response = await fetch("/api/payment/status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trans_id: transactionId }),
      });
    } catch {
      continue;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) continue;
      const message = isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Could not check the payment status.";
      throw new Error(message);
    }
    if (!isRecord(payload)) {
      throw new Error("The payment status response was invalid.");
    }

    result = payload;
  }
}
