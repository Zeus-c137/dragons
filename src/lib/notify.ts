import { createElement, Fragment } from "react";
import type { ReactNode } from "react";
import { sileo } from "sileo";
import type { SileoOptions } from "sileo";

export type ToastKind = "success" | "error" | "info" | "warning";

type NotifyOptions = Omit<SileoOptions, "title">;

const MAX_TITLE_LENGTH = 34;

const FALLBACK_TITLES: Record<ToastKind, string> = {
  success: "Success",
  error: "Something went wrong",
  info: "Heads up",
  warning: "Please check",
};

function splitMessage(text: string, kind: ToastKind): { title: string; body?: string } {
  if (text.length <= MAX_TITLE_LENGTH) return { title: text };

  // Sileo's pill is designed for a short heading. Put longer copy in the
  // expandable description so it is never clipped on a narrow screen.
  const sentence = text.match(/^[^.!?]+[.!?](?=\s|$)/)?.[0]?.trim();
  if (sentence) {
    const title = sentence.replace(/[.!?]+$/, "").trim();
    if (title.length > 0 && title.length <= MAX_TITLE_LENGTH) {
      const body = text.slice(sentence.length).trim();
      return { title, body: body || undefined };
    }
  }

  return { title: FALLBACK_TITLES[kind], body: text };
}

/**
 * Send a Sileo toast while keeping long messages readable. Short messages
 * remain the pill title; long messages become a short title plus a description.
 */
export function notify(kind: ToastKind, message: string, options: NotifyOptions = {}): string {
  const text = String(message ?? "").trim();
  const { description: extraDescription, ...rest } = options;

  if (!text) {
    return sileo[kind]({
      title: FALLBACK_TITLES[kind],
      ...(extraDescription !== undefined ? { description: extraDescription } : {}),
      ...rest,
    });
  }

  const { title, body } = splitMessage(text, kind);
  let description: ReactNode | undefined = body;

  if (extraDescription !== undefined) {
    description = body
      ? typeof extraDescription === "string"
        ? `${body}\n\n${extraDescription}`
        : createElement(Fragment, null, body, createElement("div", { className: "mt-2" }, extraDescription))
      : extraDescription;
  }

  return sileo[kind]({
    title,
    ...(description !== undefined ? { description } : {}),
    ...rest,
  });
}
