// A small calculator: + − × ÷ % ^, parentheses, decimals with a comma or a
// dot, √ and π. A parser of its own (no eval). Pure: tested on its own.

type Tok = { k: "n"; v: number } | { k: "op"; v: string } | { k: "("} | { k: ")" };

function lex(src: string): Tok[] | null {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "p").replace(/√/g, "r").replace(/\s+/g, "");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(",", ".");
      if ((raw.match(/\./g) ?? []).length > 1) return null;
      out.push({ k: "n", v: Number(raw) });
      i = j;
      continue;
    }
    if (c === "p") out.push({ k: "n", v: Math.PI });
    else if ("+-*/%^r".includes(c)) out.push({ k: "op", v: c });
    else if (c === "(") out.push({ k: "(" });
    else if (c === ")") out.push({ k: ")" });
    else return null;
    i++;
  }
  return out;
}

/** The result, or null when the expression is not complete or valid. */
export function calculate(src: string): number | null {
  const lexed = lex(src);
  if (!lexed || !lexed.length) return null;
  const toks: Tok[] = lexed;
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === "op" && (peek() as { v: string }).v === v;

  // expr := term (('+'|'-') term)*
  function expr(): number | null {
    let a = term();
    while (a != null && (isOp("+") || isOp("-"))) {
      const op = (toks[pos++] as { v: string }).v;
      const b = term();
      if (b == null) return null;
      a = op === "+" ? a + b : a - b;
    }
    return a;
  }
  // term := unary (('*'|'/'|implicit) unary)*
  function term(): number | null {
    let a = unary();
    while (a != null) {
      if (isOp("*") || isOp("/")) {
        const op = (toks[pos++] as { v: string }).v;
        const b = unary();
        if (b == null) return null;
        a = op === "*" ? a * b : a / b;
      } else if (peek()?.k === "(" || peek()?.k === "n" || isOp("r")) {
        const b = unary(); // 2(3) or 2π
        if (b == null) return null;
        a = a * b;
      } else break;
    }
    return a;
  }
  // unary := ('-'|'+'|'√') unary | power
  function unary(): number | null {
    if (isOp("-")) {
      pos++;
      const v = unary();
      return v == null ? null : -v;
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    if (isOp("r")) {
      pos++;
      const v = unary();
      return v == null || v < 0 ? null : Math.sqrt(v);
    }
    return power();
  }
  // power := postfix ('^' unary)?
  function power(): number | null {
    const a = postfix();
    if (a != null && isOp("^")) {
      pos++;
      const b = unary();
      return b == null ? null : Math.pow(a, b);
    }
    return a;
  }
  // postfix := atom '%'*
  function postfix(): number | null {
    let v = atom();
    while (v != null && isOp("%")) {
      pos++;
      v = v / 100;
    }
    return v;
  }
  function atom(): number | null {
    const t = toks[pos++];
    if (!t) return null;
    if (t.k === "n") return Number.isFinite(t.v) ? t.v : null;
    if (t.k === "(") {
      const v = expr();
      if (toks[pos]?.k !== ")") return null;
      pos++;
      return v;
    }
    return null;
  }

  const v = expr();
  if (v == null || pos !== toks.length || !Number.isFinite(v)) return null;
  return Math.round(v * 1e12) / 1e12;
}

/** A result in the user's language: "1.234,5". */
export function showNumber(v: number, lang = "pt-BR"): string {
  return v.toLocaleString(lang, { maximumFractionDigits: 10 });
}
