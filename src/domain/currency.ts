import { Client, FxRate, NormalizedFact, ReviewException } from "./model.js";
import { round } from "./utils.js";

export function normalizeCurrencyFact(
  fact: NormalizedFact,
  client: Client,
  fxRates: FxRate[],
): { fact: NormalizedFact; exception?: ReviewException } {
  if (fact.valueKind !== "currency") {
    return { fact };
  }

  const nativeCurrency = fact.currencyNative ?? client.config.reportingCurrency;
  const nativeAmount = fact.amountNative ?? fact.value;
  const reportingCurrency = client.config.reportingCurrency;

  if (nativeCurrency === reportingCurrency) {
    return {
      fact: {
        ...fact,
        currencyNative: nativeCurrency,
        amountNative: nativeAmount,
        currencyReporting: reportingCurrency,
        amountReporting: nativeAmount,
        fxRate: 1,
        fxRateDate: fact.reportingDateLocal,
        value: nativeAmount,
      },
    };
  }

  const fxRate = fxRates.find(
    (rate) =>
      rate.baseCurrency === nativeCurrency &&
      rate.quoteCurrency === reportingCurrency &&
      rate.rateDate === fact.reportingDateLocal,
  );

  if (!fxRate) {
    return {
      fact,
      exception: {
        id: `ex-fx-${fact.id}`,
        clientId: fact.clientId,
        reportMonth: fact.reportingDateLocal.slice(0, 7),
        type: "conflicting_source_totals",
        status: "open",
        title: "Missing FX rate",
        detail: `No ${nativeCurrency}->${reportingCurrency} FX rate for ${fact.reportingDateLocal}.`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const reportingAmount = round(nativeAmount * fxRate.rate);

  return {
    fact: {
      ...fact,
      currencyNative: nativeCurrency,
      amountNative: nativeAmount,
      currencyReporting: reportingCurrency,
      amountReporting: reportingAmount,
      fxRate: fxRate.rate,
      fxRateDate: fxRate.rateDate,
      value: reportingAmount,
    },
  };
}

export function formatMoney(value: number | null, currency: string): string | null {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
