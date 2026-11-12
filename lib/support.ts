/**
 * Support happens inside the platform: a signed-in person opens a ticket with the Seer team.
 * Public pages (no account yet) show the support email instead. No WhatsApp number is used.
 */
export const supportEmail = "seer-app@smail.sa";
export const supportMailto = `mailto:${supportEmail}?subject=${encodeURIComponent("استفسار عن سِير")}`;

/** The in-app place to contact the team: the person's tickets, and a new one. */
export const supportHome = "/dashboard/support";
export const newTicketPath = "/dashboard/support/new";

/**
 * The old support link. It used to open WhatsApp; it now opens a new in-app ticket. It accepts no
 * names, messages or record data, only the path of the page the person was on.
 */
export function supportLink(fromPage?: string | null): string {
  const page = (fromPage ?? "").split(/[?#]/)[0];
  return /^\/[A-Za-z0-9/_-]{0,199}$/.test(page) ? `${newTicketPath}?from=${encodeURIComponent(page)}` : newTicketPath;
}

/** Only the path of a page is kept with a ticket (no query string, so no ids or names). */
export function ticketPage(value: string | null | undefined): string | null {
  const page = (value ?? "").split(/[?#]/)[0];
  return /^\/[A-Za-z0-9/_-]{0,199}$/.test(page) ? page : null;
}
