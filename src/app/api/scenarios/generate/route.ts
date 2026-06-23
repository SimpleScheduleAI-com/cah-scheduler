import { db } from "@/db";
import { generationJob, schedule } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { runGenerationJob } from "@/lib/engine/scheduler/runner";

export async function POST(request: Request) {
  const body = await request.json();
  const { scheduleId } = body;

  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
  }

  // Verify the schedule exists
  const scheduleRecord = db.select().from(schedule).where(eq(schedule.id, scheduleId)).get();
  if (!scheduleRecord) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  // Regeneration deletes every assignment on the schedule (including manual
  // fills and callout replacements). Staff are relying on a published
  // schedule, so require an explicit unpublish first.
  if (scheduleRecord.status === "published") {
    return NextResponse.json(
      { error: "Cannot regenerate a published schedule. Unpublish it first to make changes." },
      { status: 409 }
    );
  }

  // Reject if a job is already running for this schedule — but first reclaim
  // jobs stuck in pending/running for >10 minutes. A generation takes well
  // under a minute; a stuck job means the process died mid-run (server
  // restart, crash), and without reclamation the schedule is PERMANENTLY
  // blocked from regenerating — unrecoverable for a hospital without IT.
  const STALE_JOB_MS = 10 * 60 * 1000;
  const activeJobs = db
    .select()
    .from(generationJob)
    .where(eq(generationJob.scheduleId, scheduleId))
    .all()
    .filter((j) => j.status === "pending" || j.status === "running");

  let existingJob: (typeof activeJobs)[number] | undefined;
  for (const job of activeJobs) {
    const startedMs = new Date(job.startedAt ?? job.createdAt).getTime();
    if (Date.now() - startedMs > STALE_JOB_MS) {
      db.update(generationJob)
        .set({
          status: "failed",
          error: "Reclaimed: generation did not complete (process restarted?)",
          completedAt: new Date().toISOString(),
        })
        .where(eq(generationJob.id, job.id))
        .run();
    } else {
      existingJob = job;
    }
  }

  if (existingJob) {
    return NextResponse.json(
      { error: "Generation already in progress", jobId: existingJob.id },
      { status: 409 }
    );
  }

  // Create the job record
  const job = db
    .insert(generationJob)
    .values({
      scheduleId,
      status: "pending",
      progress: 0,
      currentPhase: "Queued",
    })
    .returning()
    .get();

  // Start generation in background after this response is sent
  setImmediate(() => {
    runGenerationJob(job.id, scheduleId).catch(console.error);
  });

  return NextResponse.json({ jobId: job.id });
}
