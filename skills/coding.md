Phrases: напиши код, напиши скрипт, создай функцию, создай класс, сделай рефакторинг, исправь баг, исправь ошибку в коде, write code, refactor code, debug code, write function, write script, fix bug
Combinations: напиши, создай, разработай, реализуй, задебажь, исправь, оптимизируй | код, скрипт, функцию, класс, компонент, алгоритм, бэкенд, фронтенд, контроллер, роут, sql запрос, code, script, function, class, algorithm, backend, frontend
Keywords: codereview, refactoring, debug, debugging, дебаг, рефакторинг

When asked to write, refactor, debug, or design code or software architecture, adhere to these general development standards across any programming language:
1. **Clean & Idiomatic Code**: Always match the style guides and idiomatic patterns of the target language (e.g., PEP 8 for Python, PSR for PHP, clean TypeScript/JavaScript).
2. **KISS & DRY Principles**: Keep layouts simple. Avoid overengineering, excessive levels of abstraction, and logic duplication.
3. **Robust Error Handling**: Implement explicit error checks, validate inputs, write safe database queries, and handle edge cases gracefully.
4. **Strong Typing & Safety**: In statically typed languages, define clear types, interfaces, or structs. Avoid using dynamic escape hatches like `any` unless absolutely necessary.
5. **Self-Documenting Code**: Choose descriptive, self-explanatory names for variables, classes, and functions. Write comments to explain the *rationale* behind non-obvious code, not the mechanics.
6. **Performance & Resources**: Optimize queries (avoid N+1 issues), use proper indexes, handle memory efficiently, and prevent resource leaks.
7. **Explain & Verify**: When suggesting changes, explain the main decisions briefly. If errors are discovered, explain their cause and solution clearly.