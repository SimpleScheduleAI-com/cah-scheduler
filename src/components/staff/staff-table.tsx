"use client";

import { Badge } from "@/components/ui/badge";
import { staffLevelColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  employmentType: string;
  fte: number;
  icuCompetencyLevel: number;
  isChargeNurseQualified: boolean;
  reliabilityRating: number;
  homeUnit: string | null;
  crossTrainedUnits: string[];
  weekendExempt: boolean;
  voluntaryFlexAvailable: boolean;
  isActive: boolean;
  // Optional fields for compatibility with StaffMember
  email?: string | null;
  phone?: string | null;
  hireDate?: string;
  certifications?: string[];
  notes?: string | null;
}

const employmentLabels: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  per_diem: "Per Diem",
  float: "Float",
  agency: "Agency",
};

export function StaffTable({
  staff,
  onEdit,
  onNameClick,
}: {
  staff: Staff[];
  onEdit: (id: string) => void;
  onNameClick?: (staff: { id: string; firstName: string; lastName: string }) => void;
}) {
  if (staff.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">No staff members found.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Import your staff roster from{" "}
          <a href="/setup" className="text-primary underline underline-offset-4">
            Import / Export
          </a>{" "}
          to get started, or add staff manually using the button above.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Home Unit</TableHead>
          <TableHead>Employment</TableHead>
          <TableHead>FTE</TableHead>
          <TableHead>ICU Level</TableHead>
          <TableHead>Charge RN</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">
              {onNameClick ? (
                <button
                  onClick={() => onNameClick(s)}
                  className="text-left hover:text-primary hover:underline"
                >
                  {s.firstName} {s.lastName}
                </button>
              ) : (
                <span>{s.firstName} {s.lastName}</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={s.role === "RN" ? "default" : s.role === "LPN" ? "outline" : "secondary"}>
                {s.role}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span>{s.homeUnit || "—"}</span>
                {s.crossTrainedUnits && s.crossTrainedUnits.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    +{s.crossTrainedUnits.join(", ")}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>{employmentLabels[s.employmentType] || s.employmentType}</TableCell>
            <TableCell>{s.fte}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1">
                {s.icuCompetencyLevel}/5
                <span
                  className="inline-block h-2 rounded-full"
                  style={{
                    width: `${(s.icuCompetencyLevel / 5) * 40}px`,
                    backgroundColor: staffLevelColor(s.icuCompetencyLevel),
                  }}
                />
              </span>
            </TableCell>
            <TableCell>
              {s.isChargeNurseQualified ? (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                  <span className="text-green-600 font-medium">Yes</span>
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                  {s.isActive ? "Active" : "Inactive"}
                </Badge>
                {s.weekendExempt && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">WE</Badge>
                )}
                {s.voluntaryFlexAvailable && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-600">VTO</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => onEdit(s.id)}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
