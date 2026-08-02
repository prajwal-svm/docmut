/**
 * DocMut — public API.
 *
 * AST-based document mutation testing for LaTeX, Typst, and Markdown.
 */

import { defaultRegistry } from "./core/registry.js";

// Operators
import { latexStructuralOperators } from "./operators/latex-structural.js";
import { latexSemanticOperators } from "./operators/latex-semantic.js";
import { latexRealisticOperators } from "./operators/latex-realistic.js";
import { typstStructuralOperators } from "./operators/typst-structural.js";
import { typstSemanticOperators } from "./operators/typst-semantic.js";
import { typstRealisticOperators } from "./operators/typst-realistic.js";
import { markdownStructuralOperators } from "./operators/markdown-structural.js";
import { markdownSemanticOperators } from "./operators/markdown-semantic.js";
import { markdownRealisticOperators } from "./operators/markdown-realistic.js";

// Register all 48 operators on the default registry
defaultRegistry.registerAll([
  ...latexStructuralOperators,
  ...latexSemanticOperators,
  ...latexRealisticOperators,
  ...typstStructuralOperators,
  ...typstSemanticOperators,
  ...typstRealisticOperators,
  ...markdownStructuralOperators,
  ...markdownSemanticOperators,
  ...markdownRealisticOperators,
]);

export const ALL_OPERATORS = defaultRegistry.all();
export const OPERATOR_COUNT = ALL_OPERATORS.length;

// Core types
export type {
  DocumentAST,
  DocumentFormat,
  AstNode,
  AstNodeType,
  MutationSite,
  MutatedDocument,
  MutationResult,
  MutationOperator,
  MutateOptions,
  OperatorTier,
  MutationScope,
} from "./core/types.js";
export { DEFAULT_SALT } from "./core/types.js";

// PRNG
export {
  mulberry32,
  seedFromString,
  makePrngKey,
  createMutationRng,
  sha256,
  mutationId,
  pick,
  shuffle,
  randInt,
} from "./core/prng.js";

// Parsers
export { parseLatex } from "./core/parser-latex.js";
export { parseTypst } from "./core/parser-typst.js";
export { parseMarkdown } from "./core/parser-markdown.js";
export { parseDocument, detectFormat, findSitesForOperator, findAllSites } from "./core/mutation-site.js";

// Registry
export { OperatorRegistry, defaultRegistry } from "./core/registry.js";

// Pipeline
export {
  mutateDocument,
  mutateWithAst,
  applyOne,
  type PipelineResult,
  type PipelineStats,
} from "./core/pipeline.js";

// Render-diff / engine gate
export {
  renderDiff,
  engineGate,
  staticGate,
  compileDocument,
  compileLatex,
  compileTypst,
  extractPdfText,
  normalizePdfText,
  findTectonic,
  findTypst,
  findPdftotext,
  type CompileResult,
  type RenderDiffResult,
  type EngineGateResult,
} from "./core/render-diff.js";

// Operator groups
export { latexStructuralOperators } from "./operators/latex-structural.js";
export { latexSemanticOperators } from "./operators/latex-semantic.js";
export { latexRealisticOperators } from "./operators/latex-realistic.js";
export { typstStructuralOperators } from "./operators/typst-structural.js";
export { typstSemanticOperators } from "./operators/typst-semantic.js";
export { typstRealisticOperators } from "./operators/typst-realistic.js";
export { markdownStructuralOperators } from "./operators/markdown-structural.js";
export { markdownSemanticOperators } from "./operators/markdown-semantic.js";
export { markdownRealisticOperators } from "./operators/markdown-realistic.js";
