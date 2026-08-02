/**
 * DocMut core types — AST nodes, mutation sites, operators, and result records.
 *
 * Design principles (see PLANNING.md):
 * 1. AST-based mutations (node-level, not raw text)
 * 2. Deterministic seeded PRNG
 * 3. Render-diff equivalent detection
 * 4. Engine gate (golden compiles; hard broken fails / soft broken warns or differs)
 * 5. Tiered operators (structural / semantic / realistic)
 * 6. Plugin architecture (cosmic-ray pattern)
 */

/** Document markup format. */
export type DocumentFormat = "latex" | "typst" | "markdown";

/** Operator realism tier. */
export type OperatorTier = 1 | 2 | 3;

/**
 * Fault track (TeXFix-Bench compatible):
 * - hard: broken document must FAIL to compile
 * - soft: broken document still compiles but is faulty (warning or semantic change)
 */
export type FaultTrack = "hard" | "soft";

/**
 * Semantic scope of a mutation — enables Stryker-style reports and cohort filters.
 */
export type MutationScope =
  | "math"
  | "structure"
  | "text"
  | "citation"
  | "preamble"
  | "package"
  | "reference"
  | "font"
  | "list"
  | "heading"
  | "link"
  | "table"
  | "code"
  | "yaml"
  | "html"
  | "other";

/** Node kinds shared across LaTeX / Typst / Markdown ASTs. */
export type AstNodeType =
  // Shared
  | "root"
  | "text"
  | "comment"
  // LaTeX
  | "documentclass"
  | "usepackage"
  | "command"
  | "environment"
  | "begin_env"
  | "end_env"
  | "math_inline"
  | "math_display"
  | "group"
  | "brace_open"
  | "brace_close"
  | "label"
  | "ref"
  | "item"
  | "sectioning"
  | "preamble"
  | "body"
  // Typst
  | "import"
  | "function_call"
  | "set_rule"
  | "show_rule"
  | "content_block"
  | "string"
  | "list_item"
  | "heading"
  | "dict_entry"
  | "variable"
  | "label_typst"
  | "ref_typst"
  // Markdown
  | "md_heading"
  | "md_link"
  | "md_image"
  | "md_code_fence"
  | "md_math_block"
  | "md_table"
  | "md_yaml_frontmatter"
  | "md_html";

/**
 * A single AST node with source-span coordinates.
 * Offsets are 0-based into the original source string (including comments).
 * Line/column are 1-based for human-readable reports.
 */
export interface AstNode {
  type: AstNodeType;
  /** Inclusive start offset in original source. */
  start: number;
  /** Exclusive end offset in original source. */
  end: number;
  /** 1-based line of start. */
  line: number;
  /** 1-based column of start. */
  column: number;
  /** Optional name (command, env, package, heading text, etc.). */
  name?: string;
  /** Optional raw text of this node (for leaves). */
  text?: string;
  /** Nested children. */
  children: AstNode[];
  /** Free-form attributes (args, options, keys, etc.). */
  attrs?: Record<string, string | number | boolean | string[] | null | undefined>;
}

/** Lightweight document AST with source retained for span-based mutation. */
export interface DocumentAST {
  format: DocumentFormat;
  source: string;
  root: AstNode;
  /** SHA-256 of source (hex, no prefix). */
  sha256: string;
  /** Optional path for provenance. */
  path?: string;
}

/**
 * A valid application site for a single operator.
 * Sites are discovered by operators via `findMutationSites`.
 */
export interface MutationSite {
  /** Operator that can mutate this site. */
  operatorCode: string;
  /** AST node that is the mutation target. */
  node: AstNode;
  /** Optional finer-grained sub-span within the node (0-based absolute). */
  start?: number;
  end?: number;
  /** Human-readable label of the site (e.g. "\\leq at line 27"). */
  label: string;
  /** Operator-specific payload (swap pairs, typo targets, etc.). */
  data?: Record<string, unknown>;
}

/** Result of applying an operator at a site (before engine/render gates). */
export interface MutatedDocument {
  source: string;
  original: string;
  mutated: string;
  site: MutationSite;
  /** 1-based line of the primary edit (post-mutation when length-preserving). */
  faultLine: number;
  faultColumn: number;
  nodeType: AstNodeType;
}

/** Full mutation result record — consumable by TeXFix-Bench scoring pipeline. */
export interface MutationResult {
  id: string;
  operator: string;
  operatorName: string;
  tier: OperatorTier;
  track: FaultTrack;
  format: DocumentFormat;
  scope: MutationScope;
  seedDocument: string;
  seedHash: string;
  mutationSite: {
    line: number;
    column: number;
    nodeType: string;
  };
  original: string;
  mutated: string;
  variantIndex: number;
  prngSeed: string;
  broken: string;
  golden: string;
  brokenSha: string;
  goldenSha: string;
  equivalentDetected: boolean;
  engineGatePassed: boolean;
  /** Optional engine diagnostics. */
  engine?: {
    goldenPass: boolean | null;
    brokenPass: boolean | null;
    brokenErrors?: string[];
    brokenWarnings?: string[];
    reason?: string;
  };
  /** Ground-truth minimal reverse patch (when known). */
  groundTruthPatch?: { remove: string; add: string };
  rationale?: string;
  /** Replication metadata for TeXFix-Bench harness compatibility. */
  replication?: {
    salt: string | number;
    k: number;
    oracle?: string;
  };
}

/**
 * Mutation operator plugin interface (cosmic-ray / PIT pattern).
 *
 * Operators are pure: they discover sites on an AST and apply a mutation
 * given a deterministic PRNG (or a fixed variant index).
 */
export interface MutationOperator {
  /** Human-readable name, e.g. "MathRelationSwap". */
  name: string;
  /** Machine-readable code, e.g. "TEX-MTH-REL". */
  code: string;
  /** Realism tier: 1 structural, 2 semantic, 3 realistic author error. */
  tier: OperatorTier;
  /**
   * Fault track:
   * - hard → expects compile failure (engine gate: golden✓ broken✗)
   * - soft → expects compile success with warning/semantic change
   * Defaults to "hard" when omitted.
   */
  track?: FaultTrack;
  /** Document formats this operator applies to. */
  formats: DocumentFormat[];
  /** Semantic scope tag. */
  scope: MutationScope;
  /** Short rationale for why this models a real error. */
  rationale: string;

  /** Discover all valid mutation sites in the AST. */
  findMutationSites(ast: DocumentAST): MutationSite[];

  /**
   * Apply the mutation at `site`.
   * `variantIndex` selects among multiple variants when a site has alternatives.
   * `rng` is a deterministic [0,1) generator for any residual randomness.
   * Returns null if the site is no longer applicable.
   */
  apply(
    ast: DocumentAST,
    site: MutationSite,
    variantIndex: number,
    rng: () => number,
  ): MutatedDocument | null;
}

/** Options for a mutation pipeline run. */
export interface MutateOptions {
  /** Global salt (default 20260802). */
  salt?: string | number;
  /** Operator codes or "all" or tier filters like "tier1". */
  operators?: string[] | "all";
  /** Variants per (document × operator). Default 5. */
  variants?: number;
  /**
   * Run engine gate (compile golden + broken).
   * - true / "auto": use each operator's track (hard vs soft criteria)
   * - "hard": only keep hard-track failures (compile fail)
   * - "soft": only keep soft-track faults (compile + warning/diff)
   * - false: static differ-only check
   */
  engineGate?: boolean | "auto" | "hard" | "soft";
  /** Run render-diff equivalent detection. Default false. */
  renderDiff?: boolean;
  /**
   * When true (default), equivalent mutants are excluded from results.
   * Set false to keep them with equivalentDetected=true for transparency logs.
   */
  excludeEquivalent?: boolean;
  /** Optional document path for provenance. */
  path?: string;
  /** Working directory for multi-file compile (optional). */
  workDir?: string;
  /** Max sites considered per operator (after shuffle). Default unlimited. */
  maxSitesPerOperator?: number;
  /** Compile timeout per document (ms). Default 60000. */
  compileTimeoutMs?: number;
}

/** Default global salt pinned for reproducibility. */
export const DEFAULT_SALT = 20260802;

/** Resolve operator track with default hard. */
export function operatorTrack(op: MutationOperator): FaultTrack {
  return op.track ?? "hard";
}
