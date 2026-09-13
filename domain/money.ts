export function audToCents(input: string) {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(input)) throw new Error("Enter a valid AUD amount with up to two decimal places.");
  const [whole, fraction = ""] = input.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatAud(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}
