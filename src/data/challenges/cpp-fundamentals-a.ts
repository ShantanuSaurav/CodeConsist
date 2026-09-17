import { Challenge } from '../../types';

/**
 * Stage CPP1 - C++ Fundamentals, batch A.
 *
 * C-style basics carried over (types, operators, control flow), then what
 * C++ adds on top: iostream, std::string, references, std::vector and a
 * first class. Like the C track, `code_runner` / `debug` stay JavaScript and
 * Python only, so this stage is answer-graded rather than run-graded - see
 * the note at the top of c-fundamentals-a.ts for why.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-cpp1-a01',
    stageId: 'stage-cpp1',
    title: 'Variables and cout',
    type: 'quiz',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    int age = 20;\n' +
      '    cout << age << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['20', '"age"', 'age', '20.0'],
    correctIndex: 0,
    concept: {
      id: 'cpp-variables',
      title: 'Variables and cout',
      summary: 'C++ keeps C\'s typed variables, and adds `cout <<` for output.',
      intro:
        'C++ inherits typed variable declarations from C - `int age = 20;` still means exactly what it did there. What changes is how you print things: instead of printf and a format string, C++ gives you `cout << value`, which you can chain with more `<<` to print several things in one statement, finishing with `endl` to move to a new line.',
      example: {
        code: 'int age = 20;\ncout << age << endl;',
        language: 'cpp',
        callouts: [
          { line: 2, text: '<< sends age into cout, the standard output stream; endl adds a newline and flushes it.' }
        ]
      },
      why:
        'cout is an object (an "output stream"), and << is overloaded to mean "insert this into the stream" for every built-in type - ints, doubles, strings, characters - so you never need a format specifier: cout already knows how to print an int because you gave it one.',
      secondExample: {
        code: 'int age = 20;\ndouble gpa = 3.8;\ncout << "age " << age << " gpa " << gpa << endl;',
        language: 'cpp',
        callouts: [{ line: 3, text: 'Chaining << lets you mix literal text and variables in one statement.' }]
      },
      tryIt: {
        instructions: 'Add a second cout line that prints a message using your own variable.',
        starterCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int age = 20;\n    cout << age << endl;\n    return 0;\n}',
        language: 'cpp'
      },
      explainDifferently:
        'cout << value is like pouring value into a pipe (the stream) that leads to your terminal. Each << pours in one more thing, in order, and endl caps it off with a line break.'
    },
    hints: ['cout << age sends the value stored in age to the terminal, followed by a newline from endl.'],
    explanation:
      '`int age = 20;` stores 20 in age, and `cout << age << endl;` prints that value followed by a newline. There is no format specifier to get wrong the way there is with printf - cout already knows age is an int.',
    xpReward: 40,
    tags: ['variables', 'cout', 'io']
  },
  {
    id: 'stage-cpp1-a02',
    stageId: 'stage-cpp1',
    title: 'std::string basics',
    type: 'quiz',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      '#include <string>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    string name = "Ada";\n' +
      '    cout << "Hello, " << name << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['Hello, Ada', 'Hello, name', '"Hello, " name', 'Ada'],
    correctIndex: 0,
    concept: {
      id: 'cpp-strings',
      title: 'std::string, not char arrays',
      summary: 'C++ gives you a real string type, unlike raw C.',
      intro:
        "C makes you juggle character arrays and null terminators to work with text. C++'s standard library gives you `string` instead: a type that holds text, resizes itself, and supports + for concatenation and == for comparison, all without manual memory management.",
      example: {
        code: 'string name = "Ada";\ncout << "Hello, " << name << endl;',
        language: 'cpp',
        callouts: [{ line: 2, text: 'Chained << statements mix a literal and a variable in one line of output.' }]
      },
      why:
        'string comes from `#include <string>` (part of the standard library, distinct from the language core), and cout knows how to print one because the library defines an << overload for it - the same mechanism that lets it print an int or a double.',
      tryIt: {
        instructions: 'Change name to your own name, then add a line that prints a greeting using + to build one combined string.',
        starterCode: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name = "Ada";\n    cout << "Hello, " << name << endl;\n    return 0;\n}',
        language: 'cpp'
      },
      explainDifferently:
        'Think of `string` as a growable box of characters that already knows its own length - unlike C, you never count characters or add a terminator yourself.'
    },
    hints: ['<< prints each piece in order: the literal "Hello, " first, then the value stored in name.'],
    explanation:
      '`name` holds the text "Ada". `cout << "Hello, " << name << endl;` prints the literal text "Hello, " immediately followed by name\'s value, producing "Hello, Ada".',
    xpReward: 40,
    tags: ['strings', 'io']
  },
  {
    id: 'stage-cpp1-a03',
    stageId: 'stage-cpp1',
    title: 'Integer division still truncates',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    int a = 9;\n' +
      '    int b = 4;\n' +
      '    cout << a / b << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['2', '2.25', '3', '2.0'],
    correctIndex: 0,
    hints: ['C++ inherits C\'s integer arithmetic: int / int is int, truncated toward zero.'],
    explanation:
      'a and b are both int, so `a / b` performs integer division: 9 / 4 mathematically is 2.25, but the result is truncated to 2. Getting 2.25 would need at least one operand to be a double.',
    xpReward: 40,
    tags: ['operators', 'integer-division', 'types']
  },
  {
    id: 'stage-cpp1-a04',
    stageId: 'stage-cpp1',
    title: 'Operator precedence',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    int result = 10 - 2 * 3;\n' +
      '    cout << result << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['4', '24', '1', '-8'],
    correctIndex: 0,
    hints: ['Multiplication is evaluated before subtraction.'],
    explanation:
      '`*` binds tighter than `-`, so `2 * 3` (6) is computed first, then subtracted from 10, leaving 4.',
    xpReward: 40,
    tags: ['operators', 'precedence']
  },
  {
    id: 'stage-cpp1-a05',
    stageId: 'stage-cpp1',
    title: 'else if chains',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    int score = 72;\n' +
      '    if (score >= 90) {\n' +
      '        cout << "A" << endl;\n' +
      '    } else if (score >= 70) {\n' +
      '        cout << "B" << endl;\n' +
      '    } else {\n' +
      '        cout << "C" << endl;\n' +
      '    }\n' +
      '    return 0;\n' +
      '}',
    options: ['B', 'A', 'C', 'Nothing prints'],
    correctIndex: 0,
    hints: ['Conditions are checked in order; the first one that is true runs and the rest are skipped.'],
    explanation:
      'score is 72. `score >= 90` is false, so C++ checks `score >= 70`, which is true, printing "B" and skipping the final else entirely.',
    xpReward: 40,
    tags: ['control-flow', 'if-else']
  },
  {
    id: 'stage-cpp1-a06',
    stageId: 'stage-cpp1',
    title: 'Relational and logical operators',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'Given `int x = 5;` and `int y = 10;`, which of these expressions evaluate to true?',
    options: ['x < y', 'x == 5 && y == 10', 'x > y || y < 5', '!(x == y)', 'x >= 6'],
    correctIndices: [0, 1, 3],
    hints: ['&& needs both sides true; || only needs one side true; ! flips true and false.'],
    explanation:
      'x < y (5 < 10) is true, and x == 5 && y == 10 is true since both sides hold. x > y || y < 5 is false because neither 5 > 10 nor 10 < 5 is true. !(x == y) is true because x and y differ, so x == y is false and ! flips it to true. x >= 6 is false since x is 5.',
    xpReward: 70,
    tags: ['operators', 'boolean-logic']
  },
  {
    id: 'stage-cpp1-a07',
    stageId: 'stage-cpp1',
    title: 'Writing a for loop',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'Fill in the blank so this loop prints 0, 1, 2, each on its own line.',
    codeSnippet: 'for (int i = 0; i < 3; ___) {\n    cout << i << endl;\n}',
    blanks: [{ answer: 'i++', alternatives: ['++i', 'i += 1', 'i = i + 1'] }],
    hints: ['The third clause of a for loop runs after every pass through the body.'],
    explanation:
      '`i++` increments i after each iteration, so the loop visits i = 0, 1, 2 and stops once `i < 3` becomes false.',
    xpReward: 40,
    tags: ['loops', 'for', 'syntax']
  },
  {
    id: 'stage-cpp1-a08',
    stageId: 'stage-cpp1',
    title: 'Finding the max, in pseudocode',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'Put these lines in the correct order to find the largest value in an array called numbers.',
    pseudocodeLines: [
      'SET max TO numbers[0]',
      'FOR EACH value IN numbers',
      '    IF value > max THEN',
      '        SET max TO value',
      '    END IF',
      'END FOR',
      'PRINT max'
    ],
    hints: ['max needs a real starting point before the loop can compare anything against it.'],
    explanation:
      'max starts as the first element so every comparison has something valid to check against. Each value is then compared to the current max, replacing it whenever a bigger one turns up, and the final value is printed only once every element has been checked.',
    xpReward: 70,
    tags: ['loops', 'arrays', 'pseudocode']
  },
  {
    id: 'stage-cpp1-a09',
    stageId: 'stage-cpp1',
    title: 'Tracing a while loop',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    int i = 1;\n' +
      '    int product = 1;\n' +
      '    while (i <= 4) {\n' +
      '        product *= i;\n' +
      '        i++;\n' +
      '    }\n' +
      '    cout << product << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['24', '10', '4', '16'],
    correctIndex: 0,
    hints: ['Trace it: product multiplies in 1, then 2, then 3, then 4.'],
    explanation:
      'The loop runs for i = 1, 2, 3, 4 (it stops once i is 5). product accumulates 1 * 1 * 2 * 3 * 4 = 24 - this is exactly 4 factorial.',
    xpReward: 70,
    tags: ['loops', 'while', 'tracing']
  },
  {
    id: 'stage-cpp1-a10',
    stageId: 'stage-cpp1',
    title: 'What a reference parameter means',
    type: 'quiz',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'What does `void increment(int &n)` mean about the parameter n?',
    options: [
      'n is a reference to the caller\'s variable, so changes to n inside the function affect that variable too',
      'n is a copy of the caller\'s variable, exactly like an ordinary int parameter',
      '& means n is the memory address, printed as a number if used',
      'This is invalid syntax in C++'
    ],
    correctIndex: 0,
    hints: ['A reference parameter is an alias for the caller\'s variable, not a separate copy.'],
    explanation:
      'In a parameter list, `&` declares a reference: n becomes another name for whatever variable was passed in, not a copy of its value. Assigning to n inside the function changes the caller\'s original variable directly.',
    xpReward: 70,
    tags: ['references', 'functions']
  },
  {
    id: 'stage-cpp1-a11',
    stageId: 'stage-cpp1',
    title: 'A reference parameter changes the caller',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      'using namespace std;\n' +
      '\n' +
      'void increment(int &n) {\n' +
      '    n = n + 1;\n' +
      '}\n' +
      '\n' +
      'int main() {\n' +
      '    int x = 5;\n' +
      '    increment(x);\n' +
      '    cout << x << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['6', '5', '0', 'This does not compile'],
    correctIndex: 0,
    hints: ['increment(int &n) takes n BY REFERENCE, so n and x are two names for the same storage.'],
    explanation:
      'Because n is declared as `int &n`, it is a reference to x rather than a copy: inside increment, n and x refer to the exact same memory. Setting n to n + 1 changes x itself, so main prints 6. Compare this with plain C, which has no references and always copies - see the C track\'s pass-by-value lesson.',
    xpReward: 70,
    tags: ['references', 'functions']
  },
  {
    id: 'stage-cpp1-a12',
    stageId: 'stage-cpp1',
    title: 'Indexing a vector',
    type: 'quiz',
    difficulty: 'easy',
    language: 'cpp',
    prompt: 'Given `vector<int> nums = {10, 20, 30};`, what is `nums[1]`?',
    options: ['20', '10', '30', '1'],
    correctIndex: 0,
    hints: ['Like arrays, vector indices start at 0, so nums[1] is the SECOND element.'],
    explanation:
      'vector indexing is zero-based, the same as a plain array: nums[0] is 10, nums[1] is 20, and nums[2] is 30.',
    xpReward: 40,
    tags: ['vector', 'indexing']
  },
  {
    id: 'stage-cpp1-a13',
    stageId: 'stage-cpp1',
    title: 'Summing a vector with a range-based for loop',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'What does this program print?',
    codeSnippet:
      '#include <iostream>\n' +
      '#include <vector>\n' +
      'using namespace std;\n' +
      '\n' +
      'int main() {\n' +
      '    vector<int> nums = {1, 2, 3, 4};\n' +
      '    int sum = 0;\n' +
      '    for (int n : nums) {\n' +
      '        sum += n;\n' +
      '    }\n' +
      '    cout << sum << endl;\n' +
      '    return 0;\n' +
      '}',
    options: ['10', '4', '1234', '24'],
    correctIndex: 0,
    hints: ['`for (int n : nums)` visits every element of nums in order, one at a time, without needing an index.'],
    explanation:
      'The range-based for loop binds n to each element of nums in turn: 1, 2, 3, 4. Adding each into sum gives 1 + 2 + 3 + 4 = 10.',
    xpReward: 70,
    tags: ['vector', 'loops']
  },
  {
    id: 'stage-cpp1-a14',
    stageId: 'stage-cpp1',
    title: 'Default access in a class',
    type: 'quiz',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'In C++, are members of a `class` private or public by default, before any access specifier?',
    options: ['private', 'public', 'protected', 'It depends on the compiler'],
    correctIndex: 0,
    hints: ['This is the opposite default from `struct`, which defaults its members to public.'],
    explanation:
      'A `class` defaults its members to `private` until a `public:` or `protected:` label says otherwise. `struct` is identical in every other way but defaults to `public` - that default is the only real difference between the two keywords in C++.',
    xpReward: 70,
    tags: ['classes', 'access-control']
  },
  {
    id: 'stage-cpp1-a15',
    stageId: 'stage-cpp1',
    title: 'A method that changes its object',
    type: 'fill_blank',
    difficulty: 'medium',
    language: 'cpp',
    prompt: 'Fill in the blank so calling increment() once raises value from 0 to 1.',
    codeSnippet:
      'class Counter {\n' +
      'public:\n' +
      '    int value = 0;\n' +
      '    void increment() {\n' +
      '        value = value + ___;\n' +
      '    }\n' +
      '};',
    blanks: [{ answer: '1' }],
    hints: ['increment() should raise value by exactly one each time it is called.'],
    explanation:
      'Inside a member function, the object\'s own fields (like value) are used directly by name. `value = value + 1;` reads the current value, adds one, and stores the result back into the same field on the same object.',
    xpReward: 70,
    tags: ['classes', 'methods']
  }
];
