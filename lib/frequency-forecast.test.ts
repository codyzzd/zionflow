import assert from "node:assert/strict";
import test from "node:test";

const {
  compactFrequencyTrendLabel,
  historicalPredictionReliability,
  isAttendingRegistrationIncomplete,
  predictedFrequencyTrend,
  projectedFrequencyScenarios,
  registeredAttendingSharePercent,
  reliabilityLevel,
  retrospectiveFrequencyComparisons,
} = await import(new URL("./frequency-forecast.ts", import.meta.url).href);

test("recent increases do not become a strong drop because of older high values", () => {
  const projection = projectedFrequencyScenarios([73, 62, 90, 75, 68, 71, 74, 76], 4);

  assert.deepEqual(
    projection.map((item: { normal: number }) => item.normal),
    [77, 78, 80, 81],
  );
  assert.equal(predictedFrequencyTrend(76, projection[0].normal, [73, 62, 90, 75, 68, 71, 74, 76]), "Tendência prevista: alta provável");
});

test("older high values do not invert the recent direction", () => {
  const recentValues = [73, 62, 90, 75, 68, 71, 74, 76];
  const withOldHighs = projectedFrequencyScenarios([140, 130, ...recentValues], 1);
  const withoutOldHighs = projectedFrequencyScenarios(recentValues, 1);

  assert.ok(withOldHighs[0].normal >= recentValues.at(-1)!);
  assert.ok(withoutOldHighs[0].normal >= recentValues.at(-1)!);
});

test("differences smaller than four people are classified as stability", () => {
  assert.equal(predictedFrequencyTrend(74, 75), "Tendência prevista: estabilidade com leve chance de alta");
  assert.equal(predictedFrequencyTrend(74, 73), "Tendência prevista: estabilidade com leve chance de queda");
  assert.equal(predictedFrequencyTrend(74, 74), "Tendência prevista: estabilidade");
  assert.equal(predictedFrequencyTrend(76, 78, [68, 71, 74, 76]), "Tendência prevista: alta provável");
});

test("compact trend labels cover the five visible states", () => {
  assert.equal(compactFrequencyTrendLabel("Tendência prevista: alta provável"), "Alta");
  assert.equal(compactFrequencyTrendLabel("Tendência prevista: estabilidade com leve chance de alta"), "Leve alta");
  assert.equal(compactFrequencyTrendLabel("Tendência prevista: estabilidade"), "Estável");
  assert.equal(compactFrequencyTrendLabel("Tendência prevista: estabilidade com leve chance de queda"), "Leve queda");
  assert.equal(compactFrequencyTrendLabel("Tendência prevista: queda provável"), "Queda");
});

test("historical reliability reflects the errors of prior forecasts", () => {
  const comparisons = retrospectiveFrequencyComparisons([
    { id: "1", attendance: 70 },
    { id: "2", attendance: 72 },
    { id: "3", attendance: 71 },
    { id: "4", attendance: 73 },
    { id: "5", attendance: 72 },
    { id: "6", attendance: 73 },
    { id: "7", attendance: 72 },
    { id: "8", attendance: 73 },
  ]);

  assert.equal(historicalPredictionReliability(comparisons.values(), 72, [{ normal: 73, lower: 70, upper: 76 }], 8), "alta");
  assert.equal(historicalPredictionReliability([{ predicted: 60, delta: 15 }, { predicted: 62, delta: 13 }, { predicted: 65, delta: 10 }], 72, [{ normal: 73, lower: 70, upper: 76 }], 8), "baixa");
  assert.equal(historicalPredictionReliability(comparisons.values(), 72, [{ normal: 73, lower: 53, upper: 77 }], 8), "baixa");
});

test("recent decreases produce a falling projection", () => {
  const projection = projectedFrequencyScenarios([82, 78, 73, 69], 4);

  assert.deepEqual(
    projection.map((item: { normal: number }) => item.normal),
    [...projection.map((item: { normal: number }) => item.normal)].sort((a, b) => b - a),
  );
  assert.ok(projection[0].normal < 69);
  assert.equal(predictedFrequencyTrend(69, projection[0].normal, [82, 78, 73, 69]), "Tendência prevista: queda provável");
});

test("reliability labels light one, two, or three bars", () => {
  assert.equal(reliabilityLevel("baixa"), 1);
  assert.equal(reliabilityLevel("média"), 2);
  assert.equal(reliabilityLevel("alta"), 3);
});

test("incomplete member registration does not produce a percentage above one hundred", () => {
  assert.equal(isAttendingRegistrationIncomplete(74, 54), true);
  assert.equal(registeredAttendingSharePercent(74, 54), null);
  assert.equal(registeredAttendingSharePercent(40, 54), 74);
});
