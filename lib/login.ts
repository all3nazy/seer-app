/** Staff who joined with a username sign in as <username>@users.seer.local; emails stay as they are. */
export const usernameDomain = "users.seer.local";
export function loginEmail(input: string): string {
  const value = input.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${usernameDomain}`;
}
