+++
title = "PaperMod feature check: TOC, code highlighting, and typography"
date = 2026-07-04T11:16:00-04:00
draft = false
summary = "A skeleton post I use to sanity-check the theme's rendering: heading hierarchy, syntax highlighting for a systems language and TypeScript, inline code, and blockquotes."
tags = ["meta", "hugo", "papermod"]
ShowToc = true
TocOpen = false
+++

This is a scratch post I use to confirm the theme is rendering everything I care about. It has a heading hierarchy for the table of contents to grab, two code blocks (one systems-language, one high-level), an inline code span, a blockquote, and a couple of tags for taxonomy pages.

If you're reading this in production, I forgot to `draft = true` it. Sorry.

## Heading level 2

Some prose lives here so PaperMod's TOC has something to link to at each depth.

### Heading level 3

Nested heading, so the TOC gets more than one entry.

#### Heading level 4

One more, just to see how it renders.

## Code — a systems language

A minimal NASM program that writes `hello\n` to stdout via the Linux `write` syscall on x86-64:

```nasm
; hello.asm — assemble with:
;   nasm -f elf64 hello.asm && ld hello.o -o hello
        global  _start
        section .data
msg:    db      "hello", 10          ; the literal + newline
mlen:   equ     $ - msg              ; length as an assemble-time constant

        section .text
_start:
        mov     rax, 1               ; syscall: write
        mov     rdi, 1               ; fd:      stdout
        mov     rsi, msg
        mov     rdx, mlen
        syscall

        mov     rax, 60              ; syscall: exit
        xor     rdi, rdi             ; status:  0
        syscall
```

## Code — TypeScript

A tiny helper that reads a URL from user input and refuses anything that isn't `http`/`https`. If you were doing this in a real handler, you'd also block private and metadata IPs — see OWASP A01 (SSRF).

```ts
export function parseSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${url.protocol}`);
  }
  return url;
}
```

## Inline and quoted text

Use inline code like `parseSafeUrl("https://example.com")` mid-sentence. Use blockquotes for pull-quotes and long citations:

> A codebase is a shared model of the world. Every commit is a proposal to change how the model works — and every review is a vote on whether that proposal makes the model clearer.

## Done

If the TOC on the right (or top on mobile) lists these headings, both code blocks have syntax colors and a copy button, the blockquote has a left border, and the tags at the bottom link to `/tags/meta/` and friends — the theme is set up correctly.
