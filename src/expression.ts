import { SQLError } from "./errors.js";
import type { ComparisonOp, Expr, RowValue } from "./types.js";

type Token = { type: "word" | "number" | "string" | "op" | "paren" | "param" | "comma"; value: string };

export function tokenizeExpression(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const character = input[index]!;
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    if (character === "'") {
      let value = "";
      index++;
      while (index < input.length) {
        if (input[index] === "'" && input[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        if (input[index] === "'") break;
        value += input[index]!;
        index++;
      }
      if (input[index] !== "'") throw new SQLError("Unterminated SQL string literal.");
      tokens.push({ type: "string", value });
      index++;
      continue;
    }
    if (/[(),]/.test(character)) {
      tokens.push({ type: character === "," ? "comma" : "paren", value: character });
      index++;
      continue;
    }
    if (character === "?") {
      tokens.push({ type: "param", value: "?" });
      index++;
      continue;
    }
    const twoCharacters = input.slice(index, index + 2);
    if ([">=", "<=", "!=", "<>"].includes(twoCharacters)) {
      tokens.push({ type: "op", value: twoCharacters });
      index += 2;
      continue;
    }
    if (/[=<>]/.test(character)) {
      tokens.push({ type: "op", value: character });
      index++;
      continue;
    }
    const number = input.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const word = input.slice(index).match(/^[A-Za-z_.$][A-Za-z0-9_.$-]*/);
    if (word) {
      tokens.push({ type: "word", value: word[0] });
      index += word[0].length;
      continue;
    }
    throw new SQLError(`Unexpected token near "${input.slice(index, index + 12)}".`);
  }
  return tokens;
}

export function parseExpression(input: string, params: RowValue[] = []): Expr {
  const parser = new ExpressionParser(tokenizeExpression(input), params);
  const expression = parser.parseOr();
  parser.expectEnd();
  return expression;
}

export function andExpr(left: Expr | undefined, right: Expr): Expr {
  return left ? { type: "and", left, right } : right;
}

export function comparison(column: string, op: ComparisonOp, value: RowValue): Expr {
  return {
    type: "comparison",
    op,
    left: { type: "identifier", name: column },
    right: { type: "literal", value }
  };
}

class ExpressionParser {
  private index = 0;
  private parameterIndex = 0;

  constructor(private readonly tokens: Token[], private readonly params: RowValue[]) {}

  parseOr(): Expr {
    let expression = this.parseAnd();
    while (this.matchWord("OR")) expression = { type: "or", left: expression, right: this.parseAnd() };
    return expression;
  }

  private parseAnd(): Expr {
    let expression = this.parseNot();
    while (this.matchWord("AND")) expression = { type: "and", left: expression, right: this.parseNot() };
    return expression;
  }

  private parseNot(): Expr {
    if (this.matchWord("NOT")) return { type: "not", expr: this.parseComparison() };
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parsePrimary();
    if (this.matchWord("IS")) {
      const not = this.matchWord("NOT");
      this.expectWord("NULL");
      return { type: "is-null", expr: left, not };
    }
    const operator = this.matchOperator();
    if (!operator) return left;
    return { type: "comparison", op: operator, left, right: this.parsePrimary() };
  }

  private parsePrimary(): Expr {
    const token = this.next();
    if (!token) throw new SQLError("Unexpected end of expression.");
    if (token.type === "paren" && token.value === "(") {
      const expression = this.parseOr();
      this.expectParenthesis(")");
      return expression;
    }
    if (token.type === "string") return { type: "literal", value: token.value };
    if (token.type === "number") {
      return { type: "literal", value: token.value.includes(".") ? token.value : Number(token.value) };
    }
    if (token.type === "param") {
      if (this.parameterIndex >= this.params.length) throw new SQLError("Not enough SQL parameters supplied.");
      return { type: "literal", value: this.params[this.parameterIndex++] ?? null };
    }
    if (token.type === "word") {
      const upper = token.value.toUpperCase();
      if (upper === "NULL") return { type: "literal", value: null };
      if (upper === "TRUE") return { type: "literal", value: true };
      if (upper === "FALSE") return { type: "literal", value: false };
      return { type: "identifier", name: token.value };
    }
    throw new SQLError(`Unexpected expression token "${token.value}".`);
  }

  private matchWord(word: string): boolean {
    const token = this.peek();
    if (token?.type === "word" && token.value.toUpperCase() === word) {
      this.index++;
      return true;
    }
    return false;
  }

  private expectWord(word: string): void {
    if (!this.matchWord(word)) throw new SQLError(`Expected ${word}.`);
  }

  private expectParenthesis(parenthesis: string): void {
    const token = this.next();
    if (token?.type !== "paren" || token.value !== parenthesis) {
      throw new SQLError(`Expected "${parenthesis}".`);
    }
  }

  private matchOperator(): ComparisonOp | undefined {
    const token = this.peek();
    if (token?.type !== "op") return undefined;
    this.index++;
    return token.value as ComparisonOp;
  }

  expectEnd(): void {
    if (this.index !== this.tokens.length) {
      throw new SQLError(`Unexpected token "${this.tokens[this.index]!.value}".`);
    }
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }
}
