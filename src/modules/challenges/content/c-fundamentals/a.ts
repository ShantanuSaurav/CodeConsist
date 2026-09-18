import { Challenge } from '@/types';

/**
 * Stage C1 - C Fundamentals, batch A.
 *
 * Variables and printf, operators, control flow, functions, arrays and a
 * first look at pointers. `code_runner` / `debug` are JavaScript/Python only
 * (see docs/CONTENT_AUTHORING.md) - execution here is real, but happens
 * server-side through an optional Judge0 endpoint, not in every browser by
 * default, so this stage's lessons and its test are answer-graded rather
 * than run-graded. That keeps the C track fully usable even when nobody has
 * configured a remote compiler, exactly like the rest of Devlingo degrades
 * gracefully without one.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-c1-a01',
    stageId: 'stage-c1',
    title: 'Declaring a variable in C',
    type: 'quiz',
    difficulty: 'easy',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int age = 20;\n' +
      '    printf("%d\\n", age);\n' +
      '    return 0;\n' +
      '}',
    options: ['20', '"age"', 'age', '20.0'],
    correctIndex: 0,
    concept: {
      id: 'c-variables',
      title: 'Declaring a variable in C',
      summary: 'Every variable in C has an explicit, fixed type.',
      intro:
        "In C you can't just write \"let age = 20\" - you have to say what KIND of value age will hold before you use it. " +
        '`int age = 20;` declares a variable named age, tells the compiler it will only ever hold whole numbers, and gives it a starting value in one step. That type never changes for the life of the variable.',
      example: {
        code: 'int age = 20;\nprintf("%d\\n", age);',
        language: 'c',
        callouts: [
          { line: 1, text: 'int is the type; age is the name; 20 is the initial value.' },
          { line: 2, text: '%d tells printf to expect an int here, and to print it in base 10.' }
        ]
      },
      why:
        'C is a compiled, statically typed language: the compiler decides how much memory to set aside and how to interpret the bits in it BEFORE the program ever runs, using the type you wrote. printf has no idea what age "is" on its own - the %d in the format string is what tells it "read the next argument as an int".',
      secondExample: {
        code: 'double price = 19.99;\nprintf("%.2f\\n", price);',
        language: 'c',
        callouts: [{ line: 1, text: 'double holds a floating-point number instead of a whole number.' }]
      },
      tryIt: {
        instructions: 'Change age to your own age and run it. Then try changing int to double and see what printf("%d\\n", ...) does to a value that is no longer a whole number.',
        starterCode: '#include <stdio.h>\n\nint main(void) {\n    int age = 20;\n    printf("%d\\n", age);\n    return 0;\n}',
        language: 'c'
      },
      explainDifferently:
        'Think of a variable declaration as filling out a labeled box: "int" is the size and shape of the box (only whole numbers fit), "age" is the label on it, and "20" is what you put inside on day one.'
    },
    hints: [
      'printf("%d\\n", age) prints the value stored in age, formatted as a decimal integer.',
      'age is a variable name, not a string, so it is never printed with quotes around it.'
    ],
    explanation:
      '`int age = 20;` stores the whole number 20 in a variable named age. `%d` in the format string tells printf to read the next argument as an int and print its decimal value, so the program prints 20.',
    xpReward: 40,
    tags: ['variables', 'types', 'printf']
  },
  {
    id: 'stage-c1-a02',
    stageId: 'stage-c1',
    title: 'Matching the format specifier to the type',
    type: 'quiz',
    difficulty: 'easy',
    language: 'c',
    prompt: 'Which format specifier correctly prints a `double` with printf?',
    codeSnippet: 'double price = 19.99;\nprintf("price: ___\\n", price);',
    options: ['%f', '%d', '%s', '%c'],
    correctIndex: 0,
    concept: {
      id: 'c-printf-format',
      title: 'printf format specifiers',
      summary: 'The format specifier must match the argument\'s type, or printf reads garbage.',
      intro:
        'printf does not know the types of its arguments the way a typed function call would - it trusts the format string. `%d` reads an int, `%f` reads a double, `%c` reads a single character, and `%s` reads a pointer to a null-terminated string. Using the wrong one does not "convert" the value; it reads the bits as the wrong type entirely.',
      example: {
        code: 'int count = 3;\ndouble price = 19.99;\nchar grade = \'A\';\nprintf("%d %f %c\\n", count, price, grade);',
        language: 'c',
        callouts: [
          { line: 4, text: 'Each %-specifier consumes the next argument, matched by position, left to right.' }
        ]
      },
      why:
        'Under the hood, printf reads its arguments off the call stack (or a register) with no type information beyond the format string. That is why C compilers warn loudly when a format specifier does not match its argument - there is no runtime check to catch the mistake for you.',
      tryIt: {
        instructions: 'Fix the specifier so the price prints as a decimal number, e.g. 19.99, not something else.',
        starterCode: '#include <stdio.h>\n\nint main(void) {\n    double price = 19.99;\n    printf("%d\\n", price);\n    return 0;\n}',
        language: 'c'
      },
      explainDifferently:
        'A format specifier is like choosing the right adapter for a plug: %d is the adapter for whole numbers, %f for numbers with a decimal point. Plug a decimal number into the whole-number adapter and you get nonsense out, not an error.'
    },
    hints: [
      '%d is for int, %f is for float/double, %c is for a single character, %s is for a string.',
      'price is declared as a double, which holds a decimal value.'
    ],
    explanation:
      '`%f` is the specifier for `float`/`double` values. `%d` expects an int and would misread the bits of a double; `%s` expects a string pointer and `%c` expects a single character, so neither fits a decimal number either.',
    xpReward: 40,
    tags: ['printf', 'types', 'format-specifiers']
  },
  {
    id: 'stage-c1-a03',
    stageId: 'stage-c1',
    title: 'Integer division truncates',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int a = 7;\n' +
      '    int b = 2;\n' +
      '    printf("%d\\n", a / b);\n' +
      '    return 0;\n' +
      '}',
    options: ['3', '3.5', '4', '3.0'],
    correctIndex: 0,
    hints: [
      'When both operands of / are int, the result is int - the fractional part is discarded, not rounded.',
      '%d only knows how to print whole numbers anyway, so even a rounded 3.5 could not appear.'
    ],
    explanation:
      'a and b are both int, so `a / b` performs integer division: 7 / 2 mathematically is 3.5, but the fractional part is thrown away, leaving 3. Getting 3.5 would require making at least one operand a double, e.g. `(double)a / b`.',
    xpReward: 40,
    tags: ['operators', 'integer-division', 'types']
  },
  {
    id: 'stage-c1-a04',
    stageId: 'stage-c1',
    title: 'Operator precedence',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int result = 2 + 3 * 4;\n' +
      '    printf("%d\\n", result);\n' +
      '    return 0;\n' +
      '}',
    options: ['14', '20', '24', '9'],
    correctIndex: 0,
    hints: ['Multiplication binds tighter than addition, the same as in ordinary arithmetic.'],
    explanation:
      '`*` has higher precedence than `+`, so `3 * 4` (12) is computed first, then added to 2, giving 14. Getting 20 would require the addition to happen first, which is not how C evaluates this expression.',
    xpReward: 40,
    tags: ['operators', 'precedence']
  },
  {
    id: 'stage-c1-a05',
    stageId: 'stage-c1',
    title: 'else if chains',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int x = 5;\n' +
      '    if (x > 10) {\n' +
      '        printf("big\\n");\n' +
      '    } else if (x > 3) {\n' +
      '        printf("medium\\n");\n' +
      '    } else {\n' +
      '        printf("small\\n");\n' +
      '    }\n' +
      '    return 0;\n' +
      '}',
    options: ['medium', 'big', 'small', 'nothing - x matches no branch'],
    correctIndex: 0,
    hints: ['Conditions are checked top to bottom, and the first true one wins - the rest are skipped entirely.'],
    explanation:
      'x is 5. `x > 10` is false, so C checks the next condition: `x > 3` is true, so "medium" prints and the `else` branch is skipped. Exactly one branch of an if / else if / else chain ever runs.',
    xpReward: 40,
    tags: ['control-flow', 'if-else']
  },
  {
    id: 'stage-c1-a06',
    stageId: 'stage-c1',
    title: 'Relational and logical operators',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'c',
    prompt: 'Given `int x = 5;` and `int y = 10;`, which of these expressions evaluate to true (a nonzero value)?',
    options: ['x < y', 'x == 5 && y == 10', 'x > y || y < 5', '!(x == y)', 'x >= 6'],
    correctIndices: [0, 1, 3],
    hints: [
      '&& requires BOTH sides to be true; || only needs ONE side to be true.',
      '`!` flips a true into a false and a false into a true.'
    ],
    explanation:
      'x < y (5 < 10) is true, and x == 5 && y == 10 is true because both sides hold. x > y || y < 5 is false: neither 5 > 10 nor 10 < 5 holds. !(x == y) is true because x and y are different, so x == y is false and ! flips it. x >= 6 is false since x is 5.',
    xpReward: 70,
    tags: ['operators', 'boolean-logic', 'relational']
  },
  {
    id: 'stage-c1-a07',
    stageId: 'stage-c1',
    title: 'Writing a for loop',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'c',
    prompt: 'Fill in the blank so this loop prints 0, 1, 2, 3, 4, each on its own line.',
    codeSnippet: 'for (int i = 0; i < 5; ___) {\n    printf("%d\\n", i);\n}',
    blanks: [{ answer: 'i++', alternatives: ['++i', 'i += 1', 'i = i + 1'] }],
    hints: ['A for loop has three parts: init; condition; update. The update runs after every iteration.'],
    explanation:
      'The third clause of a for loop runs after each pass through the body. `i++` increments i by one each time, so the loop visits i = 0, 1, 2, 3, 4 and stops once `i < 5` becomes false.',
    xpReward: 40,
    tags: ['loops', 'for', 'syntax']
  },
  {
    id: 'stage-c1-a08',
    stageId: 'stage-c1',
    title: 'Summing an array, in pseudocode',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'c',
    prompt: 'Put these lines in the correct order to sum every value in an array called numbers.',
    pseudocodeLines: [
      'SET total TO 0',
      'FOR EACH value IN numbers',
      '    SET total TO total + value',
      'END FOR',
      'PRINT total'
    ],
    hints: ['The running total has to exist and start at zero BEFORE the loop begins adding to it.'],
    explanation:
      'total must be initialised to 0 before the loop runs, or the first addition would add to an undefined value. The loop then visits every element once, accumulating into total, and the result is printed only after the loop has finished.',
    xpReward: 40,
    tags: ['loops', 'arrays', 'pseudocode']
  },
  {
    id: 'stage-c1-a09',
    stageId: 'stage-c1',
    title: 'Tracing a while loop',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int i = 0;\n' +
      '    int total = 0;\n' +
      '    while (i < 4) {\n' +
      '        total += i;\n' +
      '        i++;\n' +
      '    }\n' +
      '    printf("%d\\n", total);\n' +
      '    return 0;\n' +
      '}',
    options: ['6', '4', '10', '3'],
    correctIndex: 0,
    hints: ['Trace it: total picks up 0, then 1, then 2, then 3, and the loop stops once i reaches 4.'],
    explanation:
      'The loop runs for i = 0, 1, 2, 3 (it stops as soon as `i < 4` is false, so i = 4 never enters the body). total accumulates 0 + 1 + 2 + 3 = 6.',
    xpReward: 70,
    tags: ['loops', 'while', 'tracing']
  },
  {
    id: 'stage-c1-a10',
    stageId: 'stage-c1',
    title: 'Declaring a function',
    type: 'quiz',
    difficulty: 'easy',
    language: 'c',
    prompt: 'Which of these correctly declares a function named add that takes two ints and returns an int?',
    options: [
      'int add(int a, int b);',
      'add(int a, int b) int;',
      'function add(int a, int b): int;',
      'int add(a, b);'
    ],
    correctIndex: 0,
    hints: ['In C, the return type comes first, then the name, then a parenthesized, fully typed parameter list.'],
    explanation:
      'C function declarations read return-type name(parameter types and names). `int add(int a, int b);` says: add returns an int and takes two ints. `int add(a, b);` is invalid because every parameter needs its own type; the other two options use syntax from other languages, not C.',
    xpReward: 40,
    tags: ['functions', 'syntax']
  },
  {
    id: 'stage-c1-a11',
    stageId: 'stage-c1',
    title: 'C passes arguments by value',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'void increment(int n) {\n' +
      '    n = n + 1;\n' +
      '}\n' +
      '\n' +
      'int main(void) {\n' +
      '    int x = 5;\n' +
      '    increment(x);\n' +
      '    printf("%d\\n", x);\n' +
      '    return 0;\n' +
      '}',
    options: ['5', '6', '0', 'This does not compile'],
    correctIndex: 0,
    hints: [
      'increment receives a COPY of x, stored in its own local variable n.',
      'Changing n only ever changes that copy - it cannot reach back into main to change x.'
    ],
    explanation:
      'C passes arguments by value: calling increment(x) copies the value of x into increment\'s local parameter n. Modifying n inside the function only changes that local copy, so x in main is untouched and still prints as 5. Changing the caller\'s variable requires passing its address (a pointer) instead.',
    xpReward: 70,
    tags: ['functions', 'pass-by-value', 'scope']
  },
  {
    id: 'stage-c1-a12',
    stageId: 'stage-c1',
    title: 'Array indices',
    type: 'quiz',
    difficulty: 'easy',
    language: 'c',
    prompt: 'Given `int scores[5];`, what is the LAST valid index into scores?',
    options: ['4', '5', '0', '-1'],
    correctIndex: 0,
    hints: ['An array declared with size N has valid indices 0 through N - 1.'],
    explanation:
      '`int scores[5];` reserves room for 5 ints, indexed 0, 1, 2, 3, 4. Index 5 is one past the end and reading or writing it is undefined behaviour - a classic off-by-one bug.',
    xpReward: 40,
    tags: ['arrays', 'indexing']
  },
  {
    id: 'stage-c1-a13',
    stageId: 'stage-c1',
    title: 'Summing an array with a for loop',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int nums[4] = {2, 4, 6, 8};\n' +
      '    int sum = 0;\n' +
      '    for (int i = 0; i < 4; i++) {\n' +
      '        sum += nums[i];\n' +
      '    }\n' +
      '    printf("%d\\n", sum);\n' +
      '    return 0;\n' +
      '}',
    options: ['20', '8', '4', '2468'],
    correctIndex: 0,
    hints: ['The loop visits indices 0 through 3 - every element of a 4-element array - adding each into sum.'],
    explanation:
      'The loop runs for i = 0, 1, 2, 3, adding nums[i] each time: 2 + 4 + 6 + 8 = 20. `sum += nums[i]` is shorthand for `sum = sum + nums[i]`.',
    xpReward: 70,
    tags: ['arrays', 'loops']
  },
  {
    id: 'stage-c1-a14',
    stageId: 'stage-c1',
    title: 'Storing an address',
    type: 'quiz',
    difficulty: 'medium',
    language: 'c',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <stdio.h>\n' +
      '\n' +
      'int main(void) {\n' +
      '    int x = 10;\n' +
      '    int *p = &x;\n' +
      '    printf("%d\\n", *p);\n' +
      '    return 0;\n' +
      '}',
    options: ['10', 'the memory address of x', 'x', 'This does not compile'],
    correctIndex: 0,
    concept: {
      id: 'c-pointers-basics',
      title: 'Pointers: storing an address',
      summary: '& gets an address; * follows one back to its value.',
      intro:
        'A pointer is a variable that stores a MEMORY ADDRESS instead of an ordinary value. `&x` means "the address where x lives" - it does not read x\'s value, it asks where that value is stored. `int *p` declares p as a pointer that points to an int. Once p holds &x, writing `*p` ("dereference p") means "go to that address and give me the int stored there".',
      example: {
        code: 'int x = 10;\nint *p = &x;\nprintf("%d\\n", *p);',
        language: 'c',
        callouts: [
          { line: 2, text: '&x is the address of x; p now stores that address, not the value 10 itself.' },
          { line: 3, text: '*p follows the address stored in p and reads the int sitting there: 10.' }
        ]
      },
      why:
        "Every variable lives somewhere in memory. &x is the compiler's way of exposing that location as a value you can store and pass around. *p is the inverse operation: given an address, go look at what is stored there. p and x are two different variables, but *p and x refer to the exact same storage.",
      secondExample: {
        code: 'int x = 10;\nint *p = &x;\n*p = 99;\nprintf("%d\\n", x);',
        language: 'c',
        callouts: [{ line: 3, text: 'Writing through *p changes x itself, because they are the same memory.' }]
      },
      tryIt: {
        instructions: 'Run this, then try changing *p = 99 to a different number and predict what x prints before you run it again.',
        starterCode:
          '#include <stdio.h>\n\nint main(void) {\n    int x = 10;\n    int *p = &x;\n    *p = 99;\n    printf("%d\\n", x);\n    return 0;\n}',
        language: 'c'
      },
      explainDifferently:
        'Think of x as a house and &x as its street address. p is a sticky note with that address written on it - p itself lives somewhere else entirely. *p means "go to the address on the sticky note and look inside the house", which is how you get back to 10.'
    },
    hints: [
      '&x produces the address where x is stored, not the value 10.',
      '*p dereferences p - it follows the stored address back to the value living there.'
    ],
    explanation:
      '`p` holds the address of `x` (`&x`), not the value 10 itself. `*p` dereferences that address - "go to where p points and read the value" - which is x\'s current value, 10.',
    xpReward: 70,
    tags: ['pointers', 'addresses']
  },
  {
    id: 'stage-c1-a15',
    stageId: 'stage-c1',
    title: 'Declaring and dereferencing a pointer',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'c',
    prompt: 'Fill in the blank so this program prints 42.',
    codeSnippet: 'int x = 42;\nint *p = ___;\nprintf("%d\\n", *p);',
    blanks: [{ answer: '&x' }],
    hints: ['p needs the ADDRESS of x, produced with the & operator, not x\'s value.'],
    explanation:
      '`int *p` declares p as a pointer to an int, so it must be initialised with an address, not a plain int. `&x` is the address of x, which is exactly what `*p` later dereferences to read back x\'s value, 42.',
    xpReward: 70,
    tags: ['pointers', 'syntax']
  }
];
