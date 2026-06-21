export const FREQUENCY_TREND_WINDOW = 6;

export type FrequencyProjection = {
  normal: number;
  lower: number;
  upper: number;
};

export type FrequencyComparison = {
  delta: number;
  predicted: number;
};

type FrequencyForecastStats = {
  historicalTrend: number;
  outlierCount: number;
  recentTrend: number;
  softenedTrend: number;
  volatility: number;
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));

  return Math.sqrt(variance);
}

function averageChange(values: number[]) {
  if (values.length < 2) return 0;

  return average(values.slice(1).map((value, index) => value - values[index]));
}

function detectOutlierIndexes(values: number[]) {
  const outliers = new Set<number>();

  values.forEach((value, index) => {
    const before = values.slice(Math.max(0, index - 3), index);
    const after = values.slice(index + 1, index + 4);
    const surrounding = [...before, ...after];
    if (surrounding.length < 3) return;

    const surroundingAverage = average(surrounding);
    if (surroundingAverage > 0 && value > surroundingAverage * 1.2) {
      outliers.add(index);
    }
  });

  return outliers;
}

function outlierAwareAverageChange(values: number[], outliers: Set<number>) {
  if (values.length < 2) return 0;

  const weightedChanges = values.slice(1).map((value, index) => {
    const previousIndex = index;
    const currentIndex = index + 1;
    const change = value - values[index];
    const weight = outliers.has(previousIndex) || outliers.has(currentIndex) ? 0.35 : 1;

    return { change, weight };
  });
  const weightTotal = weightedChanges.reduce((total, item) => total + item.weight, 0);
  if (!weightTotal) return 0;

  return weightedChanges.reduce((total, item) => total + item.change * item.weight, 0) / weightTotal;
}

function frequencyForecastStats(values: number[]): FrequencyForecastStats {
  const recentValues = recentFrequencyValues(values).slice(-4);
  const outliers = detectOutlierIndexes(values);
  const recentTrend = averageChange(recentValues);
  const historicalTrend = outlierAwareAverageChange(values, outliers);
  const recentChanges = recentValues.slice(1).map((value, index) => value - recentValues[index]);
  const allChanges = values.slice(1).map((value, index) => value - values[index]);
  const volatility = Math.max(standardDeviation(recentChanges), standardDeviation(allChanges) * 0.55);
  const trendDirectionAligned = recentTrend === 0 || historicalTrend === 0 || Math.sign(recentTrend) === Math.sign(historicalTrend);
  const stabilityDamping = volatility <= 4 ? 0.9 : volatility <= 9 ? 0.75 : 0.6;
  const historyWeight = trendDirectionAligned ? 0.25 : 0.15;
  const adjustedTrend = recentTrend * 0.65 + historicalTrend * historyWeight;
  let softenedTrend = adjustedTrend * stabilityDamping;

  if (Math.abs(softenedTrend) > 3) {
    softenedTrend = Math.sign(softenedTrend) * (3 + (Math.abs(softenedTrend) - 3) * 0.35);
  }

  if (Math.abs(recentTrend) >= 0.5 && Math.sign(softenedTrend) !== Math.sign(recentTrend)) {
    softenedTrend = Math.sign(recentTrend) * Math.min(Math.abs(recentTrend) * 0.4, 1);
  }

  return {
    historicalTrend,
    outlierCount: outliers.size,
    recentTrend,
    softenedTrend,
    volatility,
  };
}

export function recentFrequencyValues(values: number[]) {
  return values.slice(-FREQUENCY_TREND_WINDOW);
}

export function averageFrequency(values: number[]) {
  return Math.round(average(values));
}

export function projectedFrequencyScenarios(values: number[], count: number): FrequencyProjection[] {
  if (!values.length) return [];

  const stats = frequencyForecastStats(values);
  const lastAttendance = values.at(-1) ?? 0;
  const expected = averageFrequency(recentFrequencyValues(values));
  const minimumScenarioGap = Math.max(3, Math.round(expected * 0.05));
  const instabilityGap = Math.round(stats.volatility * 0.7 + stats.outlierCount * 1.5);

  return Array.from({ length: count }, (_, index) => {
    const step = index + 1;
    const normal = Math.max(0, Math.round(lastAttendance + stats.softenedTrend * step));
    const uncertainty = Math.max(minimumScenarioGap, Math.round((minimumScenarioGap + instabilityGap) * Math.sqrt(step)));

    return {
      normal,
      lower: Math.max(0, normal - uncertainty),
      upper: Math.max(0, normal + uncertainty),
    };
  });
}

function predictedFrequencyFromPrevious(values: number[]) {
  if (values.length < 2) return null;

  return projectedFrequencyScenarios(values, 1)[0]?.normal ?? null;
}

export function retrospectiveFrequencyComparisons(points: Array<{ id: string; attendance: number }>) {
  const comparisons = new Map<string, FrequencyComparison>();

  points.forEach((point, index) => {
    const predicted = predictedFrequencyFromPrevious(points.slice(0, index).map((previous) => previous.attendance));
    if (predicted === null) return;

    comparisons.set(point.id, {
      delta: point.attendance - predicted,
      predicted,
    });
  });

  return comparisons;
}

export function recentFrequencyTrend(values: number[]) {
  return frequencyForecastStats(values).recentTrend;
}

export function predictedFrequencyTrend(latestAttendance: number | undefined, nextProjection: number | undefined, values: number[] = []) {
  if (latestAttendance === undefined || nextProjection === undefined) return "Tendência prevista: sem base suficiente";

  const trend = values.length >= 2 ? recentFrequencyTrend(values) : nextProjection - latestAttendance;
  if (trend > 2) return "Tendência prevista: alta provável";
  if (trend >= 0.5) return "Tendência prevista: estabilidade com leve chance de alta";
  if (trend > -0.5) return "Tendência prevista: estabilidade";
  if (trend >= -2) return "Tendência prevista: estabilidade com leve chance de queda";
  if (trend < -2) return "Tendência prevista: queda provável";
  return "Tendência prevista: estabilidade";
}

export function compactFrequencyTrendLabel(label: string) {
  if (label.includes("leve chance de alta")) return "Leve alta";
  if (label.includes("leve chance de queda")) return "Leve queda";
  if (label.includes("alta provável")) return "Alta";
  if (label.includes("queda provável")) return "Queda";
  if (label.includes("estabilidade")) return "Estável";
  return "Sem base";
}

export function historicalPredictionReliability(comparisons: Iterable<FrequencyComparison>, expectedAttendance: number, projections: FrequencyProjection[] = [], recordCount = 0) {
  const errors = [...comparisons].map((comparison) => Math.abs(comparison.delta));
  const rangeWidths = projections.map((projection) => projection.upper - projection.lower);
  const averageRangeWidth = rangeWidths.length ? average(rangeWidths) : 0;
  if (errors.length < 3 || expectedAttendance <= 0 || recordCount < 5) return "baixa";
  if (averageRangeWidth > 20) return "baixa";

  const meanAbsoluteErrorRatio = average(errors) / expectedAttendance;
  if (recordCount >= 8 && averageRangeWidth <= 10 && meanAbsoluteErrorRatio <= 0.08) return "alta";
  if (recordCount >= 5 && averageRangeWidth <= 20 && meanAbsoluteErrorRatio <= 0.15) return "média";
  return "baixa";
}

export function reliabilityLevel(label: string) {
  if (label === "alta") return 3;
  if (label === "média") return 2;
  return 1;
}

export function isAttendingRegistrationIncomplete(attendance: number, registeredAttendingCount: number) {
  return attendance > 0 && registeredAttendingCount > 0 && attendance > registeredAttendingCount;
}

export function registeredAttendingSharePercent(attendance: number, registeredAttendingCount: number) {
  if (attendance <= 0 || registeredAttendingCount <= 0 || isAttendingRegistrationIncomplete(attendance, registeredAttendingCount)) return null;
  return Math.round((attendance / registeredAttendingCount) * 100);
}
