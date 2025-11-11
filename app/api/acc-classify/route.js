import { NextResponse } from "next/server";
import PipelineSingleton from "./pipeline.js";
import { ACCESSIBILITY_LABELS_IN_REVIEWS as DEFAULT_LABELS } from "../../constants/constants.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow long first-load on dev/hosting, 5 minutes

function normalizeTexts(input) {
  if (Array.isArray(input)) return input.map((t) => String(t ?? ""));
  if (typeof input === "string") return [input];
  return [];
}

async function runClassify(texts, labels, options = {}) {
  const classifier = await PipelineSingleton.getInstance();
  const batch = normalizeTexts(texts);
  const labs = Array.isArray(labels) && labels.length ? labels : DEFAULT_LABELS;

  if (!batch.length) {
    return { items: [] };
  }

  // multi_label so the model scores each label independently
  const out = await classifier(batch, labs, {
    multi_label: true,
    hypothesis_template: "This review mentions {}.",
    // allow client overrides
    ...options,
  });

  const items = Array.isArray(out) ? out : [out];
  return { items };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  const labelsCsv = searchParams.get("labels");
  const labels = labelsCsv
    ? labelsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_LABELS;

  if (!text) {
    return NextResponse.json(
      { error: "Missing text parameter" },
      { status: 400 }
    );
  }

  const result = await runClassify([text], labels);
  return NextResponse.json(result.items[0] || { labels: [], scores: [] });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { texts, labels, options } = body || {};
    const result = await runClassify(texts, labels, options);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Bad request" },
      { status: 400 }
    );
  }
}
