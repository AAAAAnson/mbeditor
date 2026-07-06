export interface ValidationFinding {
  line: number;
  rule: string;
  message: string;
  suggestion: string;
}

export interface ValidationReport {
  issues: ValidationFinding[];
  warnings: ValidationFinding[];
  stats: {
    svg_count: number;
    animate_count: number;
    animate_transform_count: number;
    set_count: number;
    anchor_count: number;
  };
}
