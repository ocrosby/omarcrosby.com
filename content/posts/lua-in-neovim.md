+++
title = "Lua in Neovim, from the ground up"
date = "2026-08-16T14:18:29-04:00"
draft = false
description = "A comprehensive introduction to Lua as it lives inside Neovim: why the project bet on it, which Lua Neovim actually runs (LuaJIT, Lua 5.1 semantics with select extensions), the whole language walked in from the smallest values to metatables and coroutines, the five gotchas that trip programmers coming from other languages, and the vim.* namespace that turns Lua into a text-editor scripting language."
summary = "A comprehensive introduction to Lua as it lives inside Neovim — why the project bet on it, which Lua Neovim actually runs (LuaJIT, Lua 5.1 semantics with select extensions), the whole language walked in from smallest values to metatables and coroutines, the five gotchas, and the vim.* namespace that turns Lua into a text-editor scripting language."
tags = ["neovim", "lua", "luajit", "plugin-development", "fundamentals", "developer-tools"]
categories = ["Neovim"]
ShowToc = true

[cover]
image = "/images/og/lua-in-neovim.png"
hiddenInList = true
hiddenInSingle = true
+++

The first time I opened someone else's `init.lua`, I saw a file full of what looked like a mostly-normal scripting language — curly braces missing, a `local` keyword everywhere, `vim.keymap.set` and `vim.api.nvim_create_autocmd` sitting comfortably next to what I recognized as anonymous functions — and I understood maybe 70% of what was on the screen. The other 30% was the part where I'd guess wrong. `if not foo then` is not what I thought it meant when `foo` was `0`. `local M = {}` at the top of every module wasn't decoration. The `:` in `mytable:method()` was doing something the `.` version wasn't. And I could not, for the life of me, find where the *body* of the plugin was — the `require` calls were pulling in files whose paths didn't obviously exist on disk. The code worked. I could copy patterns. I could not yet *think* in it.

That gap between "reading the code" and "thinking in it" is what this post is about. The good news is that Lua is a genuinely small language — the entire reference manual is around 100 pages — and once the five or six things that surprise newcomers are named out loud, the rest is mostly refreshingly ordinary. *Lua is not a bigger language pretending to be simple; it is a genuinely simple language that turned out to be enough.*

The other thing worth stating up front: the Lua inside Neovim is not quite the same Lua you'll find on `lua.org`. Neovim ships **LuaJIT**, a separate implementation whose semantics track Lua 5.1 plus a curated set of extensions. That distinction matters the moment you copy a snippet from a Lua tutorial and it works — or doesn't — for reasons the tutorial never mentions. We'll get there.

## Why Neovim uses Lua at all

Vim, since 1991, has had its own scripting language — usually called **Vimscript** or *Vim script*, formally `Ex commands` extended into a programming language. It grew organically over three decades. It gave Vim its plugin ecosystem, its filetype detection, its colorschemes, and thousands of `.vim` files that still run today. It also, by the mid-2010s, had accumulated the specific problems any editor-only DSL accumulates when it's asked to be an application platform:

- **It was slow.** Vimscript's parser and evaluator were tuned for the "run a handful of `Ex` commands on save" workload the language was designed for, not for plugins that maintained rich in-memory state, spoke to language servers, or ran periodically in the background.
- **It had almost no standard library.** No JSON, no HTTP, no real filesystem or subprocess management, no proper module system. Every plugin author reinvented these, badly, in Vimscript.
- **It had no real tests.** You could shell out to `vim -Es` and inspect output, but there was no in-process test framework, no mocking, no isolation between test cases. So plugins mostly didn't have tests.
- **The syntax fought you.** Vimscript's variable scoping (`s:`, `g:`, `l:`, `a:`, `b:`), function-declaration verbosity, and quirks around empty strings and truthiness (`if !something` interpreted "something" in ways that surprised even experienced users) meant every new plugin author paid a tax before writing useful code.

The Neovim project — which forked from Vim in 2014 under Thiago de Arruda and a growing group of contributors — inherited all of that, and decided fairly early that fixing it inside Vimscript wasn't going to work. Vimscript had to keep working, forever, for backward compatibility. The way out was to add a *second* language, sitting alongside Vimscript, that plugin authors could reach for when they needed real programming-language capabilities. The requirements for that second language were unusually strict:

1. **Embeddable.** It had to live inside the editor process, not run out-of-process. Every keystroke and every autocommand callback had to complete in microseconds; a subprocess round-trip per callback was not acceptable.
2. **Small.** The interpreter had to add negligible size to the Neovim binary. Neovim is distributed to a wide variety of platforms — including tiny ones — and a 30 MB language runtime was not on the table.
3. **Fast enough.** Startup time and per-callback overhead both had to be low. If loading the language cost 100 ms at editor startup, users would notice; if a callback fired 100 times per second and each call cost 1 ms, users would notice more.
4. **Permissive license.** Vim's own license (a modified charity-ware form) had constrained integration decisions for years. Whatever Neovim embedded had to be permissive enough that no downstream distributor would refuse to ship it.
5. **Learnable by non-programmers.** Neovim's users include full-time programmers, but they also include writers, sysadmins, and technical students who edit their config once a quarter. The language had to be readable enough that copying a snippet from a README worked and made sense.
6. **Have a working JIT.** Modern editor plugins do enough computation — LSP client work, treesitter parsing coordination, UI state — that a naive interpreter would show its seams. A serious just-in-time compiler was a hard requirement, not a nice-to-have.

That list rules out most of the languages usually reached for. Python fails on **1**, **2**, and partially on **3**. JavaScript engines like V8 or SpiderMonkey fail on **2** (V8 is ~15 MB and depends on ~50 MB of ancillary infrastructure). Ruby, Perl, and Tcl each fail on some combination. **Lua** — and specifically **LuaJIT** — clears every bar. The interpreter is roughly 200–300 KB. LuaJIT is competitive with C on many benchmarks. The license is MIT. The core language fits in a weekend. And it was already the demonstrated choice inside embedded systems, game engines (World of Warcraft, Roblox, LÖVE, Redis's original scripting, nginx's OpenResty), and the previous generation of extensible tools that made similar tradeoffs.

Neovim shipped Lua as a first-class plugin language in **version 0.5, released in July 2021**. Vimscript still works — you can put `init.vim` in your config directory today and everything runs — but the momentum, the new APIs, and almost every plugin written since then is Lua. That's the migration story. What follows is the language itself.

## Which Lua Neovim actually runs

The single most important thing to know before opening a Lua reference is that there are, effectively, two Luas.

- **PUC-Rio Lua** is the reference implementation maintained by Roberto Ierusalimschy and colleagues at the Pontifical Catholic University of Rio de Janeiro, where the language was invented in 1993. Its current release is Lua 5.4 (2020). Every language book — most prominently Roberto's own *Programming in Lua* (4th ed., 2016) — describes PUC-Rio Lua.
- **LuaJIT** is a separate, source-compatible reimplementation by Mike Pall, originally released in 2005 and still the dominant embedded Lua for performance-sensitive hosts. LuaJIT deliberately targets the **Lua 5.1** API and semantics (the version PUC-Rio released in 2006). It adds selected features from later Lua versions and adds a few of its own that PUC-Rio Lua doesn't have.

Neovim uses LuaJIT by default on every platform it can. On the platforms it can't (rare — usually exotic architectures LuaJIT hasn't targeted), Neovim falls back to PUC-Rio Lua 5.1. So the working assumption for a Neovim plugin author is: **you are writing Lua 5.1, on a very fast JIT, with a handful of extensions and one caveat about extensions you shouldn't use**.

The extensions that LuaJIT provides on top of Lua 5.1 — and which are safe to use in Neovim plugins — include:

- `goto` and `::label::` (from Lua 5.2, useful for early-continue patterns since Lua has no `continue` statement)
- The `bit` library for bitwise operations (`bit.band`, `bit.bor`, `bit.bxor`, `bit.lshift`, `bit.rshift`, and friends)
- Long-integer support and specialized number handling in the JIT
- A production-grade FFI library (`ffi.cdef`, `ffi.new`) that plugins occasionally use to call into shared libraries directly; most plugins won't touch this, but it's there.

Extensions from Lua 5.3 that LuaJIT does **not** implement include the integer/float distinction, the `//` integer division operator, and native bitwise operators (`&`, `|`, `~` — for bit work in Neovim, reach for the `bit` library instead). Almost no Neovim plugin code will care about these, because almost no Neovim plugin needs precise integer arithmetic on values large enough to lose precision in a double. If you're doing cryptography or large-integer math in a plugin, revisit the assumption.

The practical rule: when you Google a Lua feature, if the top result is described as "new in Lua 5.2" or later, verify it works in LuaJIT before you commit to it. When in doubt, the Neovim ecosystem's convention is *what LuaJIT accepts, ship; what only 5.3+ accepts, avoid or work around*.

## Values, variables, and the eight types

Lua has exactly eight value types. That is the entire type system. Every value in every program you write in Lua is one of these:

| Type | What it is | Example |
|---|---|---|
| `nil` | The absence of value. There is one nil. | `nil` |
| `boolean` | True or false. Two values. | `true`, `false` |
| `number` | A 64-bit double by default (LuaJIT). | `42`, `3.14`, `-1e10` |
| `string` | An immutable sequence of bytes. Not necessarily UTF-8. | `"hello"`, `'hi'`, `[[multi-line]]` |
| `function` | A first-class value. Can be passed around, stored, called. | `function(x) return x + 1 end` |
| `table` | The one and only structured type. Arrays, dictionaries, records, all one. | `{1, 2, 3}`, `{name = "Ada"}` |
| `userdata` | A handle to a C-owned resource. You'll see these from Neovim APIs. | `vim.uv.new_timer()` |
| `thread` | A coroutine. Not an OS thread — a cooperatively-scheduled coroutine. | `coroutine.create(fn)` |

That's it. There is no separate "list" type, no "integer" type distinct from float (in the Lua 5.1 semantics LuaJIT uses), no "class" type. Every abstraction — objects, modules, namespaces, iterators, JSON structures, plugin state — is built out of *tables*, and everything that isn't a table is one of the seven other kinds of thing.

You check a value's type with the `type` function, which returns a string:

```lua
print(type(42))         -- "number"
print(type("hello"))    -- "string"
print(type({}))         -- "table"
print(type(print))      -- "function"
print(type(nil))        -- "nil"
```

Variables are declared with `local`. If you leave `local` off, you have just created — or reassigned — a **global** variable, which lives in a globally accessible table for the lifetime of the Lua state:

```lua
local x = 10        -- local to this file/block
y = 20              -- global. Almost never what you want in a plugin.
```

The "almost never" is important. Every Lua style guide, every linter, and every seasoned plugin author will tell you: **use `local` for everything you don't specifically intend to be global**. Accidentally-global variables in a Neovim plugin leak into every other plugin's namespace, cause hard-to-debug collisions with unrelated code, and generally represent one of the top three sources of "why does this work fine standalone and break when loaded with these seven other plugins?" Never omit `local` unless you have written the word `_G` (the globals table) and thought about why.

## The five things about Lua that will trip you up

Every language has a handful of design decisions that surprise programmers coming from elsewhere. Lua's are small in number and easy to internalize once named. Naming them up front saves the hours you would otherwise spend rediscovering each one from a bug.

### 1. Arrays are 1-indexed

The first element of `{"a", "b", "c"}` is at index `1`, not `0`. So is the first character of a string when you use `string.sub(s, 1, 1)`. So is every position `for i = 1, #t do ... end` iterates over. Once you internalize this — usually within a week of using the language — it becomes muscle memory. Until then, expect to write `local first = t[0]` occasionally and stare at the resulting `nil` for a few seconds.

### 2. Only `nil` and `false` are falsy

In every conditional (`if`, `while`, `and`, `or`), the values that count as false are exactly `nil` and `false`. Everything else — including the number `0`, the empty string `""`, and an empty table `{}` — is truthy.

```lua
if 0 then print("truthy") end        -- prints "truthy"
if "" then print("truthy") end       -- prints "truthy"
if {} then print("truthy") end       -- prints "truthy"
if nil then print("truthy") end      -- prints nothing
if false then print("truthy") end    -- prints nothing
```

This is the opposite of C, Python, and JavaScript. It matters. `if buffer_lines then ...` in Lua means "if `buffer_lines` is not `nil` and not `false`" — an empty table still enters the branch. To check emptiness in a table, you check its length or its first key, not its truthiness.

### 3. `and` and `or` return values, not booleans

`a and b` evaluates `a`; if `a` is falsy, it returns `a`; otherwise it returns `b`. `a or b` evaluates `a`; if `a` is truthy, it returns `a`; otherwise it returns `b`. This gives you the language's default idiom for defaulting a value:

```lua
local name = opts.name or "default_name"
```

If `opts.name` is `nil` or `false`, `name` becomes `"default_name"`; otherwise it takes `opts.name`. The pattern shows up constantly in Neovim plugin code. It also gives you the ternary-equivalent:

```lua
local msg = success and "ok" or "failed"
```

That last one has a well-known gotcha: if the "true" branch value can itself be falsy (`success and 0 or "failed"` will incorrectly return `"failed"` because `0` — wait, no, `0` is truthy in Lua; try again — `success and false or "failed"`), the pattern silently degrades. So the idiom works for non-falsy values. For genuine three-way conditionals with falsy possibilities, use an explicit `if`.

### 4. `#` on a table is defined only for arrays without holes

The length operator `#t` returns "some border" of the table — a specific position `n` such that `t[n]` is not `nil` and `t[n+1]` is `nil`. If your table has no holes (every position from `1` to some `n` is non-nil), `#t` returns `n` and everything is fine. If the array has holes, `#t` returns *some* border, but *which* border is not defined:

```lua
local t = {"a", "b", nil, "d"}
print(#t)   -- may print 2, may print 4. LuaJIT does not promise.
```

The practical rule: **do not put `nil` in the middle of an array-style table if you intend to iterate over it with `#`**. If you need "empty slots," use a sentinel value, or use a dictionary-style table with numeric keys and track the max yourself.

### 5. There is no `continue` statement

Lua 5.1 (and LuaJIT following it) does not have a `continue` keyword. The idiomatic replacement uses `goto` with a label:

```lua
for _, item in ipairs(items) do
    if item.skip then
        goto continue
    end
    -- ... real work ...
    ::continue::
end
```

That looks strange the first time you see it. It reads naturally after the second or third time. Some older Lua code — from before LuaJIT/Lua 5.2 added `goto` — uses an inverted `if` (`if not item.skip then ... end`) inside the loop body, which is also fine. Both patterns are correct; choose one and be consistent.

Those five are the whole surprise budget. Everything else in Lua does what a reader with prior programming experience would expect.

## Control flow

Lua's control-flow syntax is deliberately minimalist. There are three kinds of loops and one kind of `if`:

```lua
-- if/elseif/else
if x > 0 then
    print("positive")
elseif x < 0 then
    print("negative")
else
    print("zero")
end

-- while
local i = 1
while i <= 10 do
    print(i)
    i = i + 1
end

-- repeat/until (post-condition; block is entered at least once)
repeat
    local input = io.read()
until input == "quit"

-- numeric for (inclusive on both ends)
for i = 1, 10 do
    print(i)         -- prints 1..10
end

for i = 10, 1, -1 do
    print(i)         -- prints 10..1
end

-- generic for (over an iterator)
for key, value in pairs({a = 1, b = 2}) do
    print(key, value)
end

for index, value in ipairs({"x", "y", "z"}) do
    print(index, value)
end
```

The `pairs` iterator visits every key-value pair in a table, in an unspecified order. The `ipairs` iterator visits only the array part (integer keys `1..n`, stopping at the first `nil`), in numeric order. When you're iterating a table you think of as an array, use `ipairs`; when you're iterating a dictionary-like table, use `pairs`. Mixing them up is a common source of "why did I only get half the entries?" bugs.

`break` works as expected. `return` also works as expected, but with a twist we're about to hit: it can return multiple values.

## Functions

Functions in Lua are first-class values. They can be assigned to variables, passed as arguments, returned from other functions, and stored in tables. They are also — usefully — the syntactic seed for method calls, module exports, callbacks, and half of the standard library.

```lua
-- Function literal, assigned to a variable
local greet = function(name)
    return "Hello, " .. name
end

-- Sugar for the same thing
local function greet(name)
    return "Hello, " .. name
end

print(greet("Ada"))    -- "Hello, Ada"
```

The `local function` form is not just cosmetic — it's slightly different in that it lets the function's body reference itself recursively via its own name (mutual-recursion patterns need care in the literal form). Prefer `local function` for named functions.

Functions can return more than one value. This is not a tuple; it is genuinely multiple return values:

```lua
local function divmod(a, b)
    return a // b, a % b   -- wait — no // in LuaJIT
end

-- Correct for LuaJIT:
local function divmod(a, b)
    return math.floor(a / b), a % b
end

local q, r = divmod(17, 5)
print(q, r)    -- 3, 2
```

Multiple return values are how `pcall` returns its `(ok, error_or_result)` shape, how `string.find` returns match positions, how `next` returns the next `(key, value)`. Callers who only want the first value ignore the rest; callers who want all of them destructure with commas.

Functions accept variable numbers of arguments via `...`:

```lua
local function log(level, ...)
    local args = {...}
    for i, arg in ipairs(args) do
        print(level, i, arg)
    end
end

log("INFO", "user", 42, true)
```

The `...` inside a function body is a real value — usually captured as a table with `{...}` for iteration, or forwarded as-is when you're wrapping another function:

```lua
local function trace(fn)
    return function(...)
        print("calling fn")
        return fn(...)
    end
end
```

Closures work as expected: a function captures the variables in scope at the point it was defined, and those captures live as long as the function does:

```lua
local function counter()
    local n = 0
    return function()
        n = n + 1
        return n
    end
end

local next_id = counter()
print(next_id())    -- 1
print(next_id())    -- 2
print(next_id())    -- 3
```

Callbacks in Neovim plugins are almost always closures that capture some setup state at the outer level. If you find yourself passing arguments through several functions to reach a callback, look at closures first.

## Strings

Strings are immutable byte sequences. Any operation that "modifies" a string returns a new one. Concatenation uses `..` (two dots, not `+`):

```lua
local greeting = "Hello, " .. "world"
local shout    = greeting .. "!"
```

There are three ways to write string literals:

```lua
local a = "double quotes with escape: \n and \""
local b = 'single quotes with escape: \n and \''
local c = [[double-brackets
for multi-line strings, no escaping needed for " or ']]
local d = [==[
double-brackets with extra equals-signs, for when the string itself contains ]]
]==]
```

The `[[ ... ]]` form is the one you'll see in Neovim configs for embedded shell commands, Lua-in-Vimscript snippets, and heredoc-style regexes.

String methods live in two places. The `string` library provides them as top-level functions (`string.sub`, `string.match`, `string.format`), and — because Lua sets the string metatable to `string` — you can also call them as methods:

```lua
local s = "hello world"
print(string.upper(s))   -- "HELLO WORLD"
print(s:upper())         -- "HELLO WORLD" — the : method syntax
print(#s)                -- 11 (length in bytes, not characters)
```

The `:` syntax passes the string as the first argument to the function. It's the same trick that gives you method calls on tables (`instance:method(x)` is sugar for `instance.method(instance, x)`). We'll revisit the `:` when we get to metatables.

**`#s` gives you the length in bytes, not the length in Unicode characters.** For an ASCII string those are the same; for anything else, they aren't. Neovim strings are usually UTF-8, and if you need character counting, use `vim.str_utfindex` and `vim.str_byteindex` — not `#`.

## Lua patterns are not regular expressions

Lua's `string.match`, `string.find`, `string.gmatch`, and `string.gsub` do not accept regular expressions. They accept **Lua patterns** — a smaller, related pattern language that is easier to implement, easier to specify, and different enough from regex to bite you if you assume otherwise.

Key differences from POSIX/Perl-style regex:

- The escape character is `%`, not `\`. So a literal dot is `%.` and a whitespace class is `%s`.
- Character classes: `%a` (letters), `%d` (digits), `%s` (whitespace), `%w` (alphanumeric), `%p` (punctuation). Uppercase versions negate: `%A` (non-letter), `%D` (non-digit).
- Anchors: `^` at the start, `$` at the end.
- Quantifiers: `*` (0+, greedy), `+` (1+, greedy), `-` (0+, lazy), `?` (0 or 1).
- There is no alternation (`|`) and no backreferences in the general regex sense. Captures are numbered, and `%1`, `%2`, etc. inside a *replacement* string refer to them, but in a pattern itself there are no `(?:...)` groups.
- Balanced matches (`%bxy`) and frontier patterns (`%f[set]`) are Lua-specific and useful, but unfamiliar.

For most Neovim work, patterns are enough. When they aren't — usually because you want alternation or lookahead — you have three options: use Neovim's own regex engine via `vim.regex(pattern)`, spawn a subprocess to `rg`/`grep`, or (in rare cases) reach for a Lua regex library. Do not spend a day trying to make Lua patterns emulate a regex; use the right tool.

## Tables — the one data structure

Lua has one structured type, and it is the table. Everything you would use a list, a dictionary, a record, a class, a namespace, or a JSON-like object for in another language, you use a table for in Lua. That looks impoverished until you see how much a table can carry.

```lua
-- Array-style
local fruits = {"apple", "banana", "cherry"}
print(fruits[1])    -- "apple"

-- Dictionary-style
local person = {name = "Ada", age = 36}
print(person.name)      -- "Ada"
print(person["name"])   -- "Ada", same thing

-- Mixed
local config = {
    "positional",         -- assigned to index 1
    debug = true,         -- assigned to key "debug"
    "another positional", -- assigned to index 2
    nested = {
        level = 2,
    },
}
```

A table is a hash map internally. The array-style syntax `{1, 2, 3}` is sugar for `{[1] = 1, [2] = 2, [3] = 3}`; the "array part" is a JIT-friendly optimization for the common case of dense integer keys starting at 1. As long as you don't put holes in your array, `ipairs` and `#` will do what you expect.

Because tables are the universal structured type, plugin APIs use them for everything. Here's a Neovim keymap definition:

```lua
vim.keymap.set("n", "<leader>ff", require("telescope.builtin").find_files, {
    desc = "Find files",
    silent = true,
})
```

The last argument is a table used as an *options bag* — a common Lua idiom that gets you the effect of keyword arguments without needing them as a language feature. Every Neovim API that accepts `{ opt1 = ..., opt2 = ... }` is using this pattern.

Tables are compared by reference, not by content:

```lua
print({1,2,3} == {1,2,3})    -- false — different tables
local t = {1,2,3}
print(t == t)                -- true — same table
```

For structural equality, use `vim.deep_equal(a, b)` — one of the utilities Neovim provides on top of Lua's minimal core.

## Metatables — the extension mechanism

Metatables are the single feature that lets Lua feel like a much larger language. A metatable is *another table* that you can attach to a value; special keys in the metatable (called **metamethods**) override how the value responds to specific operations.

The most-used metamethod is `__index`. When you access a key that doesn't exist on a table, Lua checks the metatable's `__index`. If `__index` is a table, Lua looks up the key there. If it's a function, Lua calls it with `(table, key)`.

That single mechanism gives you:

- **Default values.** Attach a metatable whose `__index` returns a default for missing keys.
- **Object-oriented inheritance.** Set `__index` on an instance's metatable to a "class" table containing methods.
- **Lazy attributes.** Use a function `__index` that computes on demand and caches.
- **Read-only proxies.** Set both `__index` and `__newindex` to intercept reads and writes.

Here's what an "object" looks like in Lua, using the standard idiom:

```lua
local Point = {}
Point.__index = Point         -- when a Point instance looks up a missing key,
                              -- fall through to Point (which holds the methods).

function Point.new(x, y)
    local self = setmetatable({}, Point)
    self.x = x
    self.y = y
    return self
end

function Point:distance_from_origin()
    return math.sqrt(self.x^2 + self.y^2)
end

local p = Point.new(3, 4)
print(p:distance_from_origin())    -- 5
```

Two syntactic sugars are doing work in that example:

- `function Point:distance_from_origin()` is sugar for `function Point.distance_from_origin(self)`. The `:` in the *definition* means "this function has an implicit `self` first parameter."
- `p:distance_from_origin()` is sugar for `p.distance_from_origin(p)`. The `:` in the *call* means "call this function with the value on the left as the first argument."

Every Neovim plugin whose API uses `:method()` calls is using this pattern. There are no classes as a language feature; there are just tables, `setmetatable`, and this convention.

Other metamethods you'll see in Neovim plugin code:

| Metamethod | Triggers on | Common use |
|---|---|---|
| `__index` | reading a missing key | inheritance, defaults, lazy attributes |
| `__newindex` | writing to a missing key | read-only tables, side-effect on write |
| `__call` | calling a table like a function | making a module directly callable |
| `__tostring` | passing to `tostring` or `print` | custom formatting |
| `__eq`, `__lt`, `__le` | equality and ordering | value-object comparison |
| `__len` | `#t` | overriding length |
| `__pairs` | `pairs(t)` (Lua 5.2+, LuaJIT-supported) | custom iteration |

Metatables aren't a "did we really need this?" feature — they are what Neovim itself uses internally for `vim.opt` (so that `vim.opt.number = true` maps to `nvim_set_option_value`), for `vim.g`/`vim.b`/`vim.w` (so that `vim.g.my_setting = 1` maps to a global-variable set), and for many plugins' fluent APIs. Every one of those "how does that work?" moments in Neovim's Lua interface traces back to a metatable somewhere.

## Modules and `require`

Lua's module system is intentionally minimal: a module is a file that returns a value (usually a table); `require` loads a file by name, evaluates it, and caches the result.

```lua
-- File: lua/mymod/greetings.lua
local M = {}

function M.hello(name)
    return "Hello, " .. name
end

function M.goodbye(name)
    return "Goodbye, " .. name
end

return M
```

```lua
-- Somewhere else
local greetings = require("mymod.greetings")
print(greetings.hello("Ada"))
```

The dot in `require("mymod.greetings")` maps to a directory separator on disk. Lua searches its `package.path` (a semicolon-separated list of file-pattern templates) for a matching file. Neovim, on top of Lua, injects the `lua/` subdirectory of every `runtimepath` entry into that search — which is why `require("mymod.greetings")` finds `lua/mymod/greetings.lua` in any plugin or config directory on your `runtimepath`.

The convention of `local M = {}` at the top and `return M` at the bottom exists so that everything in the module is namespaced under `M` (so callers can `require("...")` and get a single table to work with), and so that `local` at the top of the file is enforced by the module's shape (nothing leaks to globals).

**The cache gotcha.** `require` caches. If you edit `mymod/greetings.lua` and re-run `:luafile init.lua`, the old version is still cached in `package.loaded["mymod.greetings"]`. To force a reload during development, clear the cache:

```lua
package.loaded["mymod.greetings"] = nil
local greetings = require("mymod.greetings")   -- fresh load
```

Neovim provides a shortcut: `:lua vim.pack` in newer versions (or via helpers like `plenary.reload.reload_module("mymod.greetings")` in older ones) does this for you. The gotcha itself — that `require` returns cached results — is worth knowing regardless of the reload helper you use, because it explains a whole class of "why isn't my change taking effect?" bugs.

## Error handling

Lua's error model is deliberately small. An error is either **raised** (which propagates up the stack until it hits a protected call or crashes the program) or **caught** (which stops the propagation and gives you an `(ok, error_or_result)` pair).

```lua
-- Raise
error("something went wrong")
error({code = 42, message = "structured error"})     -- errors can be any value

-- Catch
local ok, result = pcall(function()
    return risky_operation()
end)
if ok then
    print("got", result)
else
    print("error:", result)     -- result is the error value
end

-- assert(cond, msg) — shorthand for "if not cond then error(msg) end"
assert(type(x) == "number", "x must be a number")
```

`pcall` (short for "protected call") is the everyday error-handling primitive. `xpcall` is the same idea with a custom error handler you can use to attach a stack trace at the point of the error. `error` accepts any value — a string, a table, whatever suits your error shape.

The idiomatic error-return convention in most Lua APIs — and the one Neovim's `vim.fn` follows for functions that can fail — is `(result, err)` where a non-nil `err` indicates failure. This is a convention, not a language feature; different libraries do it differently. Read the docs.

## Coroutines

A coroutine is a function that can suspend itself and be resumed later. It is not a thread — there is no preemption, no OS-level scheduler. Two coroutines never run at the same instant; one yields, then the other resumes.

```lua
local co = coroutine.create(function(start)
    print("phase 1", start)
    local a = coroutine.yield(start * 2)
    print("phase 2", a)
    local b = coroutine.yield(a + 10)
    print("phase 3", b)
    return b * 100
end)

print(coroutine.resume(co, 5))    -- true, 10  (from yield(start * 2))
print(coroutine.resume(co, 7))    -- true, 17  (from yield(a + 10))
print(coroutine.resume(co, 3))    -- true, 300 (final return)
```

Coroutines are the foundation of some plugin patterns you'll see: `plenary.async` uses them to give an async/await-ish syntax; some LSP client code uses them for stepwise workflows. Most day-to-day Neovim scripting doesn't touch them directly — the callback-based patterns Neovim's API uses handle asynchrony without coroutines — but they're there when you need them.

## The standard library

Lua 5.1's standard library is compact. Every entry below is a table of functions:

- **`string`** — pattern matching, formatting, case conversion, substring extraction.
- **`table`** — `insert`, `remove`, `concat`, `sort`. That's most of it.
- **`math`** — the usual (`sqrt`, `sin`, `abs`, `random`, constants like `math.pi` and `math.huge`).
- **`io`** — file I/O. In Neovim plugins, prefer `vim.uv` for anything nontrivial (it's async and non-blocking).
- **`os`** — `time`, `date`, `getenv`, `execute`. Same caution — prefer Neovim APIs.
- **`debug`** — introspection (`debug.traceback`, `debug.getinfo`). Useful for error handlers.

LuaJIT adds:

- **`bit`** — bitwise operations. Used by anything doing color-code manipulation, byte-level parsing, or bitmap flags.

That's most of what you get from the language itself. Everything else — JSON, HTTP, cryptography, subprocess management, filesystem walking — comes from Neovim (`vim.*`), from libraries like `plenary`, or from your own code.

## The vim.* namespace: Lua's superpower inside Neovim

Everything above is standard Lua. What makes Lua useful for editing text is the `vim` global that Neovim injects into every Lua state. That global is a table full of nested tables, most of them backed by C functions in the Neovim core. Here's the map you'll refer to for your first year:

### Options — `vim.opt`, `vim.o`, `vim.g`, `vim.b`, `vim.w`, `vim.env`

Neovim exposes Vim's option system through six related tables, each one for a different scope:

- **`vim.opt.<name>`** — the option-object interface. `vim.opt.number = true`, `vim.opt.wrap = false`, `vim.opt.rtp:append("~/mystuff")` — the `:append`/`:prepend`/`:remove` methods work because `vim.opt` values have a metatable that responds to those calls.
- **`vim.o.<name>`** — the raw scalar interface for global options. `vim.o.background = "dark"`.
- **`vim.g.<name>`** — the Vim global-variable namespace (`g:foo` in Vimscript is `vim.g.foo` in Lua).
- **`vim.b.<name>`** — buffer-local variables (`b:foo`).
- **`vim.w.<name>`** — window-local variables (`w:foo`).
- **`vim.env.<name>`** — environment variables, per Neovim process. `vim.env.PATH = "/opt/bin:" .. vim.env.PATH`.

For most beginner configs, `vim.opt` and `vim.g` are 90% of what you'll touch.

### Keymaps — `vim.keymap.set`

```lua
vim.keymap.set("n", "<leader>ff", "<cmd>Telescope find_files<cr>", { desc = "Find files" })
vim.keymap.set("v", "<leader>y", '"+y', { desc = "Yank to system clipboard" })
```

Arguments: mode (string or list of strings), left-hand side (the keys to bind), right-hand side (a string command or a Lua function), and an options table. The `desc` field is the small kindness you owe your future self; `which-key.nvim` and similar plugins read it.

### Autocommands — `vim.api.nvim_create_autocmd`

```lua
vim.api.nvim_create_autocmd("BufWritePost", {
    pattern = "*.lua",
    callback = function(args)
        vim.notify("Saved " .. args.file)
    end,
})
```

Autocommands are the Vim mechanism for reacting to editor events (buffer read, filetype detected, file written, cursor moved, etc.). The Lua form takes an event name (or list of names) and an options table containing at minimum a `callback` (Lua function) or `command` (Vimscript string).

The strongly-recommended pattern in real configs is to put related autocommands in a *group* so they can be cleared and re-installed cleanly on reload:

```lua
local grp = vim.api.nvim_create_augroup("my_config", { clear = true })

vim.api.nvim_create_autocmd("FileType", {
    group = grp,
    pattern = "markdown",
    callback = function() vim.opt_local.wrap = true end,
})
```

### User commands — `vim.api.nvim_create_user_command`

```lua
vim.api.nvim_create_user_command("Reload", function()
    for name, _ in pairs(package.loaded) do
        if name:match("^myconfig%.") then
            package.loaded[name] = nil
        end
    end
    vim.notify("myconfig reloaded")
end, { desc = "Reload my config modules" })
```

That defines a Vim `:Reload` command in Lua. The third argument is an options table; `desc` is the human-readable description, `nargs`/`complete`/`range` shape the command's argument handling.

### Async and timers — `vim.uv` (formerly `vim.loop`)

Neovim embeds libuv, the same event loop that powers Node.js. Access it through `vim.uv`:

```lua
local timer = vim.uv.new_timer()
timer:start(1000, 0, vim.schedule_wrap(function()
    print("one second later, on the main thread")
end))
```

`vim.schedule_wrap` is critical: libuv callbacks fire on a background thread, but almost every Neovim API can only be called on the main thread. Wrapping the callback with `vim.schedule_wrap` (or manually calling `vim.schedule(fn)` inside it) marshals the call back to the main thread. Forgetting to do this is the classic bug in any first-time async code.

The `vim.loop` name still works as an alias, but `vim.uv` is the current spelling.

### Bridge to Vimscript — `vim.fn` and `vim.cmd`

- **`vim.fn.<name>(args)`** — calls a Vimscript function from Lua. `vim.fn.expand("%:p")`, `vim.fn.executable("git")`, `vim.fn.getcwd()`. The value comes back as a Lua value (string, number, table).
- **`vim.cmd([[ ... ]])`** — runs one or more `Ex` commands as a string. `vim.cmd("colorscheme habamax")`, or multi-line via long brackets. There's also `vim.cmd.colorscheme("habamax")` — a metatable trick that lets you call Ex commands as if they were Lua functions.

The bridge is what lets you migrate a Vimscript config to Lua incrementally: any Vimscript function or command is one line of Lua away.

### Utilities — the `vim.*` helper set

Neovim ships a curated set of helpers that make everyday Lua work with tables and strings less verbose:

- `vim.tbl_deep_extend(behavior, ...)` — merge tables recursively. `behavior` is `"error" | "keep" | "force"`.
- `vim.tbl_isempty(t)`, `vim.tbl_count(t)`, `vim.tbl_contains(t, v)`.
- `vim.list_extend(dst, src)`, `vim.list_slice(list, start, finish)`.
- `vim.split(s, sep, opts)` and `vim.trim(s)`.
- `vim.inspect(v)` — pretty-printer for any value, invaluable for debugging.
- `vim.notify(msg, level)` — the "print a message the user will see" call; better than `print` because it plays with `nvim-notify` and other UIs.
- `vim.schedule(fn)` — defer `fn` to the main-thread event loop.
- `vim.deep_equal(a, b)`.

Every one of these was written because Lua's stdlib doesn't cover the case. Reach for `vim.tbl_*` before rolling your own.

## A small worked example: an `init.lua` from scratch

Here is a minimal `init.lua` that ties several of the patterns above together — options, a global, an autocommand group, a keymap, and a user command:

```lua
-- 1. Leader keys before any keymap definitions
vim.g.mapleader      = " "
vim.g.maplocalleader = ","

-- 2. Options
vim.opt.number         = true
vim.opt.relativenumber = true
vim.opt.expandtab      = true
vim.opt.shiftwidth     = 4
vim.opt.tabstop        = 4
vim.opt.smartindent    = true
vim.opt.termguicolors  = true

-- 3. Autocommand group — cleared on reload
local aug = vim.api.nvim_create_augroup("myconfig", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
    group = aug,
    desc = "Briefly highlight yanked text",
    callback = function()
        vim.highlight.on_yank({ timeout = 200 })
    end,
})

-- 4. Keymap
vim.keymap.set("n", "<leader>w", "<cmd>write<cr>", { desc = "Save file" })

-- 5. User command
vim.api.nvim_create_user_command("Cwd", function()
    vim.notify(vim.fn.getcwd())
end, { desc = "Print current working directory" })
```

Every line of that uses ideas from earlier sections: `vim.g` for globals, `vim.opt` for options, `vim.api.nvim_create_augroup` and `nvim_create_autocmd` for autocommands, `vim.keymap.set` for keymaps, `vim.fn.getcwd()` for calling a Vimscript function from Lua, `vim.notify` for user-facing messages. Once these are patterns you can read fluently, the rest of the config-and-plugin ecosystem is a superset of the same patterns applied more heavily.

## Steelmanning the alternatives

Whenever a project makes a language bet at Neovim's scale, other language partisans respond. The healthiest version of the conversation names the strongest form of the opposing view before pushing back.

**"Just keep writing Vimscript."** Vimscript is real, still supported, still shipped, still has a working plugin ecosystem. If you already know it, if the plugin you're writing is small, and if it stays inside the editor's built-in domain (buffer manipulation, autocommands, mappings), Vimscript is fine — sometimes better, because it stays close to the editor's native vocabulary. The failure mode isn't in choosing Vimscript for a small thing; it's in choosing it for something that grows into a large thing, then paying the rewrite cost when the language runs out of vocabulary for what the plugin needs to do. If your plugin never grows past that boundary, the debate is theoretical.

**"Neovim should have picked JavaScript / Python / a language people already know."** The argument on ecosystem size is real. A language everyone already writes lowers the barrier to plugin contribution. What that argument understates is the six requirements from earlier — none of the popular alternatives clear all six, and the ones that get closest (Python) sacrifice the embeddability and startup-time requirements that would have made the editor feel worse for every user in exchange for making it easier for a subset of authors. The chosen tradeoff privileges the user (fast startup, low overhead, small binary) over the plugin author (a familiar language). Reasonable people can disagree with the ranking; the ranking is defensible.

**"Lua's minimalism just pushes complexity into plugin libraries."** This is true, and it's the price Lua asks. Because the language is small, every plugin ecosystem builds its own conventions on top — object-oriented patterns via metatables, async via coroutines or callbacks, module structure via `local M = {}`. There is no one blessed way. The upside is that the language itself doesn't lock you into any of these; the downside is that reading two plugins written by two different authors sometimes feels like reading two different languages. Neovim's `vim.*` utilities and the emerging conventions in the community (deps injection, `M.setup(opts)`, structured `on_attach` callbacks) are converging toward de facto standards, but the convergence is ongoing.

**"LuaJIT is unmaintained; Neovim should move to Lua 5.4."** LuaJIT's maintenance cadence has slowed since Mike Pall stepped back from active development, and this concern comes up regularly in the community. Neovim's response has been to keep supporting LuaJIT as the default (because of its performance advantages on the workloads plugins actually generate), while also supporting PUC-Rio Lua 5.1 as a fallback and monitoring the question. Realistically: the LuaJIT bet is unlikely to unwind soon, because the performance gap is real and no PUC-Rio Lua version has closed it. If the situation changes, Neovim will have to make a call. The historical pattern is that these choices persist for a decade at a time.

## What this post does NOT teach you

Being honest about the boundary of a piece is what makes it trustworthy. This introduction covers Lua as a language and its interface into Neovim. It does not cover:

- **How to configure a plugin manager or install specific plugins.** For that, the [Getting started with Neovim](/posts/getting-started-with-neovim/) post is the companion that walks through `lazy.nvim`, plugin selection, and the practical first-config steps.
- **How Neovim finds and loads Lua files.** The runtimepath rules and the `after/plugin/` mechanism are covered in [How Neovim actually loads a plugin](/posts/how-neovim-actually-loads-a-plugin/) — read that before writing your own plugin.
- **Structural decisions when you're building a real plugin.** Deps injection, the `M.setup(opts)` convention, `on_attach` patterns, snacks-first vs plenary-first — covered in [Five structural decisions that shape a Neovim plugin's future](/posts/five-structural-decisions-neovim-plugin-quality/).
- **LSP configuration specifics, treesitter queries, DAP setup.** These are ecosystems in their own right; the Lua language material here is a prerequisite, not a substitute.
- **Vimscript.** If you inherit a `.vim` config or read the code of an older plugin, you'll want at least a passing knowledge of Vimscript's syntax and scoping. `:help vim-script-intro` inside Neovim itself is the shortest path.
- **The internals of LuaJIT.** How the trace compiler works, when JIT compilation kicks in, how to inspect the generated machine code — real material, but almost never load-bearing for plugin authors.
- **Metatable-driven metaprogramming beyond the common patterns.** You can write DSLs, custom iterators, and elaborate inheritance chains in Lua. Almost every Neovim plugin doesn't, and mostly shouldn't. The idiomatic Neovim plugin uses metatables sparingly — enough for OO, enough for a fluent API where warranted, no more.

Naming these limits is the point: this post is a foundation. The ecosystem posts above build on it, and the official reference (`:h lua`) is the source of truth for anything that goes deeper.

## The one thing to take away

If you take one idea from this post: **Lua's smallness is not a limitation, it is the whole point** — and the way to become fluent is to stop translating from another language and start using the patterns Lua actually gives you.

Read someone else's `init.lua` and try to name the pattern behind each line: option, keymap, autocommand, module, closure, options-bag table, `setmetatable` for OO. When you can name every pattern in a config, you can write your own. When you can write your own, you can read plugin source code. When you can read plugin source code, the rest of the Neovim ecosystem opens up.

Sit with an existing config — yours, someone else's, a distribution's — for one focused hour, and name the pattern behind every line. If you get stuck on a line, `:help` the function on that line and read the paragraph. Do that once, and the fluency clicks.

The editor, it turns out, was always waiting for you to speak its language.

## Where to read more

- **[Ierusalimschy, *Programming in Lua* (4th ed., 2016)](https://www.lua.org/pil/)** — the canonical reference by Lua's principal designer. The first edition is freely available online at that link; the 4th edition covers Lua 5.3, so read with the LuaJIT caveats above in mind.
- **[Lua 5.1 Reference Manual](https://www.lua.org/manual/5.1/)** — the exact language version LuaJIT targets. Short, precise, and the source of truth for what does and doesn't work in Neovim.
- **[LuaJIT documentation](https://luajit.org/luajit.html)** — Mike Pall's project site. The [extensions page](https://luajit.org/extensions.html) is the definitive list of what LuaJIT adds on top of Lua 5.1.
- **`:help lua-guide` inside Neovim** — the built-in orientation to the `vim.*` namespace; regularly updated with each Neovim release.
- **`:help lua`** — the API reference for the same. Denser than the guide; the source of truth for `vim.api.*`, `vim.fn.*`, `vim.uv.*`, and everything else Neovim injects.
- **[Neovim Lua-guide (online)](https://neovim.io/doc/user/lua-guide.html)** — the same guide, in a browsable form; useful for linking to from PRs.
- **Ierusalimschy, de Figueiredo & Celes, "The Evolution of Lua" (HOPL III, 2007)** — the history of how Lua reached the shape it has. Worth reading for the design-decision reasoning behind features that look strange at first.
- **[Getting started with Neovim](/posts/getting-started-with-neovim/)** — practical companion for setting up a working editor once you know the language.
- **[How Neovim actually loads a plugin](/posts/how-neovim-actually-loads-a-plugin/)** — the runtimepath rules that make `require` and `after/plugin/` work.
- **[Five structural decisions that shape a Neovim plugin's future](/posts/five-structural-decisions-neovim-plugin-quality/)** — the design conventions the ecosystem is converging on.
