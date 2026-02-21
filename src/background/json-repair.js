/**
 * background.js — Background script da extensão Chrome
 * Responsável por:
 *  - Buscar grupos do Facebook do usuário
 *  - Buscar posts do feed de grupos
 *  - Verificar login e extrair tokens de autenticação
 *  - Obter a data de criação do perfil
 */

// ─────────────────────────────────────────────────────────────
// PARSER DE JSON PERMISSIVO (jsonrepair)
// Converte JSON malformado/parcial em JSON válido
// ─────────────────────────────────────────────────────────────
class JsonParseError extends Error {
  constructor(message, position) {
    super(`${message} at position ${position}`);
    this.position = position;
  }
}

// Códigos de espaço em branco aceitos
const SPACE = 32;
const NEWLINE = 10;
const TAB = 9;
const CARRIAGE = 13;
const NBSP = 160;
const EN_SPACE = 8192;
const HAIR_SPACE = 8202;
const NARROW_NBSP = 8239;
const MATH_SPACE = 8287;
const IDEOGRAPHIC = 12288;

function isHexChar(ch) {
  return /^[0-9A-Fa-f]$/.test(ch);
}
function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isPrintable(ch) {
  return ch >= " ";
}
function isSpecialChar(ch) {
  return ",:[]/{}()\n+".includes(ch);
}
function isAlpha(ch) {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_" ||
    ch === "$"
  );
}
function isAlphaNumeric(ch) {
  return isAlpha(ch) || (ch >= "0" && ch <= "9");
}
function isSpecialArray(ch) {
  return ",[]/{}\n+".includes(ch);
}
function isQuoteOrWord(ch) {
  return isQuote(ch) || /^[[{\w-]$/.test(ch);
}
function isEscapeChar(ch) {
  return (
    "\n" === ch || "\r" === ch || "\t" === ch || "\b" === ch || "\f" === ch
  );
}

const URL_PROTOCOL_REGEX = /^(http|https|ftp|mailto|file|data|irc):\/\/$/;
const URL_CHAR_REGEX = /^[A-Za-z0-9-._~:/?#@!$&'()*+;=]$/;

function isWhitespace(str, pos) {
  const code = str.charCodeAt(pos);
  return (
    code === SPACE || code === NEWLINE || code === TAB || code === CARRIAGE
  );
}

function isWhitespaceNoNewline(str, pos) {
  const code = str.charCodeAt(pos);
  return code === SPACE || code === TAB || code === CARRIAGE;
}

function isUnicodeSpace(str, pos) {
  const code = str.charCodeAt(pos);
  return (
    code === NBSP ||
    (code >= EN_SPACE && code <= HAIR_SPACE) ||
    code === NARROW_NBSP ||
    code === MATH_SPACE ||
    code === IDEOGRAPHIC
  );
}

function isQuote(ch) {
  return isDoubleQuote(ch) || isSingleQuote(ch);
}
function isDoubleQuote(ch) {
  return ch === '"' || ch === "\u201C" || ch === "\u201D";
}
function isStandardDoubleQuote(ch) {
  return ch === '"';
}
function isSingleQuote(ch) {
  return (
    ch === "'" ||
    ch === "\u2018" ||
    ch === "\u2019" ||
    ch === "`" ||
    ch === "\u00B4"
  );
}
function isStandardSingleQuote(ch) {
  return ch === "'";
}

function removeLastOccurrence(str, char, remove = false) {
  const idx = str.lastIndexOf(char);
  if (idx === -1) return str;
  return str.substring(0, idx) + (remove ? "" : str.substring(idx + 1));
}

function insertBeforeTrailingWhitespace(str, insertion) {
  let end = str.length;
  if (!isWhitespace(str, end - 1)) return str + insertion;
  while (isWhitespace(str, end - 1)) end--;
  return str.substring(0, end) + insertion + str.substring(end);
}

function removeCharAt(str, pos, count) {
  return str.substring(0, pos) + str.substring(pos + count);
}

const ESCAPE_MAP = {
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};
const UNESCAPE_MAP = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

/**
 * Tenta corrigir e parsear JSON malformado.
 * Retorna string JSON válida ou lança JsonParseError.
 */
function repairJson(input) {
  let pos = 0;
  let output = "";

  skipCodeFences(["```", "[```", "{```"]);

  if (!parseValue()) {
    throw new JsonParseError("Unexpected end of json string", input.length);
  }

  skipCodeFences(["```", "```]", "```}"]);

  const hasComma = consumeChar(",");
  if (hasComma) skipWhitespace();

  if (isQuoteOrWord(input[pos]) && /[,\n][ \t\r]*$/.test(output)) {
    if (!hasComma) output = insertBeforeTrailingWhitespace(output, ",");
    parseImplicitArray();
  } else if (hasComma) {
    output = removeLastOccurrence(output, ",");
  }

  while (input[pos] === "}" || input[pos] === "]") {
    pos++;
    skipWhitespace();
  }

  if (pos >= input.length) return output;

  // ── Funções internas ──────────────────────────────────────

  function parseValue() {
    skipWhitespace();
    const result =
      parseObject() ||
      parseArray() ||
      parseString() ||
      parseNumber() ||
      parseLiteral("true", "true") ||
      parseLiteral("false", "false") ||
      parseLiteral("null", "null") ||
      parseLiteral("True", "true") ||
      parseLiteral("False", "false") ||
      parseLiteral("None", "null") ||
      parseUnquotedString(false) ||
      parseRegexLiteral();

    skipWhitespace();
    return result;
  }

  function skipWhitespace(includeNewlines = true) {
    const start = pos;
    let moved;
    do {
      moved = skipSpaceChars(includeNewlines);
      if (moved) moved = skipComment();
    } while (moved);
    return pos > start;
  }

  function skipSpaceChars(includeNewlines) {
    const checker = includeNewlines ? isWhitespace : isWhitespaceNoNewline;
    let acc = "";
    for (;;) {
      if (checker(input, pos)) {
        acc += input[pos];
        pos++;
      } else if (isUnicodeSpace(input, pos)) {
        acc += " ";
        pos++;
      } else break;
    }
    if (acc.length > 0) {
      output += acc;
      return true;
    }
    return false;
  }

  function skipComment() {
    if (input[pos] === "/" && input[pos + 1] === "*") {
      while (pos < input.length && !isEndOfBlockComment(input, pos)) pos++;
      pos += 2;
      return true;
    }
    if (input[pos] === "/" && input[pos + 1] === "/") {
      while (pos < input.length && input[pos] !== "\n") pos++;
      return true;
    }
    return false;
  }

  function skipCodeFences(fences) {
    if (matchAndSkip(fences)) {
      if (isAlpha(input[pos]))
        while (pos < input.length && isAlphaNumeric(input[pos])) pos++;
      skipWhitespace();
      return true;
    }
    return false;
  }

  function matchAndSkip(options) {
    for (const opt of options) {
      const end = pos + opt.length;
      if (input.slice(pos, end) === opt) {
        pos = end;
        return true;
      }
    }
    return false;
  }

  function consumeChar(ch) {
    if (input[pos] === ch) {
      output += input[pos];
      pos++;
      return true;
    }
    return false;
  }

  function skipChar(ch) {
    if (input[pos] === ch) {
      pos++;
      return true;
    }
    return false;
  }

  function skipEllipsis() {
    skipWhitespace();
    if (
      input[pos] === "." &&
      input[pos + 1] === "." &&
      input[pos + 2] === "."
    ) {
      pos += 3;
      skipWhitespace();
      skipChar(",");
      return true;
    }
    return false;
  }

  function parseObject() {
    if (input[pos] !== "{") return false;

    output += "{";
    pos++;
    skipWhitespace();
    if (input[pos] === ",") {
      pos++;
    }
    skipWhitespace();

    let first = true;
    while (pos < input.length && input[pos] !== "}") {
      let needsComma;
      if (first) {
        needsComma = true;
        first = false;
      } else {
        needsComma = consumeChar(",");
        if (!needsComma) output = insertBeforeTrailingWhitespace(output, ",");
        skipWhitespace();
      }

      skipEllipsis();
      if (!parseString() && !parseUnquotedString(true)) {
        if (["}", "{", "]", "[", undefined].includes(input[pos])) {
          output = removeLastOccurrence(output, ",");
        } else {
          throwObjectKeyExpected();
        }
        break;
      }

      skipWhitespace();
      const hasColon = consumeChar(":");
      const atEnd = pos >= input.length;

      if (!hasColon) {
        if (isQuoteOrWord(input[pos]) || atEnd)
          output = insertBeforeTrailingWhitespace(output, ":");
        else throwColonExpected();
      }

      if (!parseValue()) {
        if (hasColon || atEnd) output += "null";
        else throwColonExpected();
      }
    }

    if (input[pos] === "}") {
      output += "}";
      pos++;
    } else output = insertBeforeTrailingWhitespace(output, "}");

    return true;
  }

  function parseArray() {
    if (input[pos] !== "[") return false;

    output += "[";
    pos++;
    skipWhitespace();
    if (input[pos] === ",") {
      pos++;
    }
    skipWhitespace();

    let first = true;
    while (pos < input.length && input[pos] !== "]") {
      if (first) {
        first = false;
      } else {
        if (!consumeChar(","))
          output = insertBeforeTrailingWhitespace(output, ",");
      }
      skipEllipsis();
      if (!parseValue()) {
        output = removeLastOccurrence(output, ",");
        break;
      }
    }

    if (input[pos] === "]") {
      output += "]";
      pos++;
    } else output = insertBeforeTrailingWhitespace(output, "]");

    return true;
  }

  function parseImplicitArray() {
    let first = true;
    let hasMore = true;
    while (hasMore) {
      if (first) {
        first = false;
      } else {
        if (!consumeChar(","))
          output = insertBeforeTrailingWhitespace(output, ",");
      }
      hasMore = parseValue();
    }
    if (!hasMore) output = removeLastOccurrence(output, ",");
    output = `[\n${output}\n]`;
  }

  function parseNumber() {
    const start = pos;

    if (input[pos] === "-") {
      pos++;
      if (isEndOfInput()) {
        appendNumberSuffix(start);
        return true;
      }
      if (!isDigit(input[pos])) {
        pos = start;
        return false;
      }
    }

    while (isDigit(input[pos])) pos++;

    if (input[pos] === ".") {
      pos++;
      if (isEndOfInput()) {
        appendNumberSuffix(start);
        return true;
      }
      if (!isDigit(input[pos])) {
        pos = start;
        return false;
      }
      while (isDigit(input[pos])) pos++;
    }

    if (input[pos] === "e" || input[pos] === "E") {
      pos++;
      if (input[pos] === "-" || input[pos] === "+") pos++;
      if (isEndOfInput()) {
        appendNumberSuffix(start);
        return true;
      }
      if (!isDigit(input[pos])) {
        pos = start;
        return false;
      }
      while (isDigit(input[pos])) pos++;
    }

    if (!isEndOfInput()) {
      pos = start;
      return false;
    }
    if (pos > start) {
      const raw = input.slice(start, pos);
      output += /^0\d/.test(raw) ? `"${raw}"` : raw;
      return true;
    }
    return false;
  }

  function parseLiteral(token, replacement) {
    if (input.slice(pos, pos + token.length) === token) {
      output += replacement;
      pos += token.length;
      return true;
    }
    return false;
  }

  function parseRegexLiteral() {
    if (input[pos] !== "/") return;
    const start = pos;
    for (
      pos++;
      pos < input.length && (input[pos] !== "/" || input[pos - 1] === "\\");
      pos++
    );
    pos++;
    output += `"${input.substring(start, pos)}"`;
    return true;
  }

  function parseString(strict = false, stopAt = -1) {
    let hadBackslash = input[pos] === "\\";
    if (hadBackslash) {
      pos++;
    }

    if (!isQuote(input[pos])) return false;

    const quoteType = isStandardDoubleQuote(input[pos])
      ? isStandardDoubleQuote
      : isStandardSingleQuote(input[pos])
        ? isStandardSingleQuote
        : isSingleQuote(input[pos])
          ? isSingleQuote
          : isDoubleQuote;

    const startPos = pos;
    const outputStart = output.length;
    let strOutput = '"';

    pos++;
    for (;;) {
      if (pos >= input.length) {
        const nonWsPos = findLastNonWhitespace(pos - 1);
        if (!strict && isSpecialChar(input.charAt(nonWsPos))) {
          pos = startPos;
          output = output.substring(0, outputStart);
          return parseString(true);
        }
        strOutput = insertBeforeTrailingWhitespace(strOutput, '"');
        output += strOutput;
        return true;
      }

      if (pos === stopAt) {
        strOutput = insertBeforeTrailingWhitespace(strOutput, '"');
        output += strOutput;
        return true;
      }

      if (quoteType(input[pos])) {
        const closingPos = pos;
        const strOutputStart = strOutput.length;
        strOutput += '"';
        pos++;
        output += strOutput;
        skipWhitespace(false);

        if (
          strict ||
          pos >= input.length ||
          isSpecialChar(input[pos]) ||
          isQuote(input[pos]) ||
          isDigit(input[pos])
        ) {
          concatenateStrings();
          return true;
        }

        const prevNonWs = findLastNonWhitespace(closingPos - 1);
        const prevChar = input.charAt(prevNonWs);

        if (prevChar === ",") {
          pos = startPos;
          output = output.substring(0, outputStart);
          return parseString(false, prevNonWs);
        }
        if (isSpecialChar(prevChar)) {
          pos = startPos;
          output = output.substring(0, outputStart);
          return parseString(true);
        }

        output = output.substring(0, outputStart);
        pos = closingPos + 1;
        strOutput = `${strOutput.substring(0, strOutputStart)}\\${strOutput.substring(strOutputStart)}`;
      } else {
        if (strict && isSpecialArray(input[pos])) {
          if (
            input[pos - 1] === ":" &&
            URL_PROTOCOL_REGEX.test(input.substring(startPos + 1, pos + 2))
          ) {
            while (pos < input.length && URL_CHAR_REGEX.test(input[pos])) {
              strOutput += input[pos];
              pos++;
            }
          }
          strOutput = insertBeforeTrailingWhitespace(strOutput, '"');
          output += strOutput;
          concatenateStrings();
          return true;
        }

        if (input[pos] === "\\") {
          const nextCh = input.charAt(pos + 1);
          if (UNESCAPE_MAP[nextCh] !== undefined) {
            strOutput += input.slice(pos, pos + 2);
            pos += 2;
          } else if (nextCh === "u") {
            let hexLen = 2;
            while (hexLen < 6 && isHexChar(input[pos + hexLen])) hexLen++;
            if (hexLen === 6) {
              strOutput += input.slice(pos, pos + 6);
              pos += 6;
            } else if (pos + hexLen >= input.length) {
              pos = input.length;
            } else throwInvalidUnicode();
          } else {
            strOutput += nextCh;
            pos += 2;
          }
        } else {
          const ch = input.charAt(pos);
          if (ch === '"' && input[pos - 1] !== "\\") {
            strOutput += `\\${ch}`;
            pos++;
          } else if (isEscapeChar(ch)) {
            strOutput += ESCAPE_MAP[ch];
            pos++;
          } else {
            if (!isPrintable(ch)) throwInvalidChar(ch);
            strOutput += ch;
            pos++;
          }
        }
      }

      if (hadBackslash) skipChar("\\");
    }
  }

  function concatenateStrings() {
    let concatenated = false;
    for (skipWhitespace(); input[pos] === "+"; ) {
      concatenated = true;
      pos++;
      skipWhitespace();
      output = removeLastOccurrence(output, '"', true);
      const outLen = output.length;
      const success = parseString();
      if (success) output = removeCharAt(output, outLen, 1);
      else output = insertBeforeTrailingWhitespace(output, '"');
    }
    return concatenated;
  }

  function parseUnquotedString(isObjectKey) {
    const start = pos;
    if (isAlpha(input[pos])) {
      while (pos < input.length && isAlphaNumeric(input[pos])) pos++;
      let lookAhead = pos;
      while (isWhitespace(input, lookAhead)) lookAhead++;
      if (input[lookAhead] === "(") {
        pos = lookAhead + 1;
        parseValue();
        if (input[pos] === ")") {
          pos++;
          if (input[pos] === ";") pos++;
        }
        return true;
      }
    }

    while (
      pos < input.length &&
      !isSpecialArray(input[pos]) &&
      !isQuote(input[pos]) &&
      (!isObjectKey || input[pos] !== ":")
    )
      pos++;

    if (
      input[pos - 1] === ":" &&
      URL_PROTOCOL_REGEX.test(input.substring(start, pos + 2))
    ) {
      while (pos < input.length && URL_CHAR_REGEX.test(input[pos])) pos++;
    }

    if (pos > start) {
      while (isWhitespace(input, pos - 1) && pos > 0) pos--;
      const raw = input.slice(start, pos);
      output += raw === "undefined" ? "null" : JSON.stringify(raw);
      if (input[pos] === '"') pos++;
      return true;
    }
  }

  function findLastNonWhitespace(idx) {
    while (idx > 0 && isWhitespace(input, idx)) idx--;
    return idx;
  }

  function isEndOfInput() {
    return (
      pos >= input.length ||
      isSpecialChar(input[pos]) ||
      isWhitespace(input, pos)
    );
  }

  function appendNumberSuffix(start) {
    output += `${input.slice(start, pos)}0`;
  }

  // Error helpers
  function throwInvalidChar(ch) {
    throw new JsonParseError(`Invalid character ${JSON.stringify(ch)}`, pos);
  }
  function throwObjectKeyExpected() {
    throw new JsonParseError("Object key expected", pos);
  }
  function throwColonExpected() {
    throw new JsonParseError("Colon expected", pos);
  }
  function throwInvalidUnicode() {
    const seq = input.slice(pos, pos + 6);
    throw new JsonParseError(`Invalid unicode character "${seq}"`, pos);
  }
  function throwUnexpectedChar() {
    throw new JsonParseError(
      `Unexpected character ${JSON.stringify(input[pos])}`,
      pos,
    );
  }

  throwUnexpectedChar();
}

function isEndOfBlockComment(str, pos) {
  return str[pos] === "*" && str[pos + 1] === "/";
}

export { repairJson };
