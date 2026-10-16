/**
 * Repair script: rebuild `staff_holiday_assignment` (the annual holiday
 * ledger behind "Holiday Fairness (Annual)") from the live assignment table.
 *
 * Why: before v1.11.1, regenerating a schedule left the old ledger rows in
 * place and applying the Fairness/Cost draft never rewrote them, so a nurse
 * could be credited with a holiday the posted schedule gave to someone else.
 * New writes are fixed; this cleans up rows written before the fix.
 *
 * What it does (see planLedgerRepair in src/lib/holidays/holiday-tracking.ts):
 *   - REMOVE rows no live assignment backs (stale owner, deleted schedule,
 *     or the nurse was called out / cancelled / swapped off the holiday)
 *   - ADD a row for every live holiday assignment that has none
 *   - REPOINT rows whose nurse/holiday/year is right but whose shift or
 *     assignment link is stale
 * Christmas Eve + Day stay one "Christmas" per nurse per year.
 *
 * Idempotent: a second run reports 0 changes.
 *
 * Run (dry run first — prints the plan, writes nothing):
 *   DATABASE_PATH=./cah-scheduler.db npx tsx scripts/repair-holiday-assignments.ts
 * Then apply (one transaction):
 *   DATABASE_PATH=./cah-scheduler.db npx tsx scripts/repair-holiday-assignments.ts --apply
 *
 * DATABASE_PATH is REQUIRED so the script never silently picks a default DB.
 * Back up the DB file first. Do not point it at production without the
 * founder's go-ahead.
 */

const apply = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_PATH) {
    console.error(
      "DATABASE_PATH is required, e.g.\n" +
        "  DATABASE_PATH=./cah-scheduler.db npx tsx scripts/repair-holiday-assignments.ts",
    );
    process.exit(2);
  }

  // Dynamic imports: src/db/index.ts reads DATABASE_PATH at module load.
  const { db, sqlite } = await import("../src/db");
  const { staff } = await import("../src/db/schema");
  const { planLedgerRepair, applyLedgerRepair } =
    await import("../src/lib/holidays/holiday-tracking");

  console.log(`Database: ${process.env.DATABASE_PATH}`);
  console.log(apply ? "Mode: APPLY" : "Mode: dry run (pass --apply to write)");

  const names = new Map(
    db
      .select({ id: staff.id, f: staff.firstName, l: staff.lastName })
      .from(staff)
      .all()
      .map((s) => [s.id, `${s.f} ${s.l}`]),
  );
  const who = (id: string) => names.get(id) ?? id;

  const plan = planLedgerRepair();

  for (const r of plan.remove) {
    console.log(`  REMOVE  ${r.year} ${r.holidayName} — ${who(r.staffId)}`);
  }
  for (const w of plan.add) {
    console.log(
      `  ADD     ${w.year} ${w.holidayName} — ${who(w.staffId)} (${w.date})`,
    );
  }
  for (const { row, source } of plan.repoint) {
    console.log(
      `  RELINK  ${row.year} ${row.holidayName} — ${who(row.staffId)} → ${source.date}`,
    );
  }
  console.log(
    `Plan: ${plan.remove.length} remove, ${plan.add.length} add, ${plan.repoint.length} relink`,
  );

  if (apply) {
    db.transaction(() => applyLedgerRepair(plan));
    const after = planLedgerRepair();
    const left = after.remove.length + after.add.length + after.repoint.length;
    console.log(
      left === 0
        ? "Applied. Ledger now matches the assignment table."
        : `Applied, but ${left} differences remain — investigate.`,
    );
    if (left !== 0) process.exitCode = 1;
  }

  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
