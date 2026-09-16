import { Challenge } from '../../types';

/**
 * Stage 01 - Programming Basics, batch B.
 * Functions and parameters, return values, string methods, type conversion,
 * operator precedence, ternaries, switch, template literals, try/catch and
 * simple recursion.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-1-b01',
    stageId: 'stage-1',
    title: 'Missing and extra arguments',
    type: 'output_prediction',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'What does this program print?',
    codeSnippet:
      'function describe(name, age) {\n' +
      '  return name + " is " + age;\n' +
      '}\n' +
      'console.log(describe("Sam"));\n' +
      'console.log(describe("Sam", 9, "extra"));',
    options: [
      'Sam is undefined then Sam is 9',
      'Sam is null then Sam is 9',
      'A TypeError about the missing argument, then Sam is 9',
      'Sam is undefined then Sam is 9 extra'
    ],
    correctIndex: 0,
    hints: [
      'JavaScript never checks how many arguments you passed.',
      'A parameter with no matching argument holds the same value as a declared-but-unset variable.'
    ],
    explanation:
      'A parameter that receives no argument is initialised to undefined, and string concatenation turns that into the text "undefined". Extra arguments beyond the declared parameters are simply ignored, so the third argument never appears.',
    xpReward: 40,
    tags: ['functions', 'parameters', 'undefined']
  },
  {
    id: 'stage-1-b02',
    stageId: 'stage-1',
    title: 'Return exits the whole function',
    type: 'debug',
    difficulty: 'easy',
    language: 'javascript',
    prompt:
      'allPositive should return true only when every number is greater than zero, but it only ever looks at the first element. Fix it.',
    starterCode:
      'function allPositive(numbers) {\n' +
      '  for (let i = 0; i < numbers.length; i++) {\n' +
      '    if (numbers[i] > 0) {\n' +
      '      return true;\n' +
      '    } else {\n' +
      '      return false;\n' +
      '    }\n' +
      '  }\n' +
      '  return true;\n' +
      '}',
    entryFunction: 'allPositive',
    testCases: [
      { input: '[1, 2, 3]', expected: 'true' },
      { input: '[1, -2, 3]', expected: 'false' },
      { input: '[-1, 2]', expected: 'false' },
      { input: '[0, 1]', expected: 'false' },
      { input: '[]', expected: 'true' }
    ],
    solutionCode:
      'function allPositive(numbers) {\n' +
      '  for (let i = 0; i < numbers.length; i++) {\n' +
      '    if (numbers[i] <= 0) {\n' +
      '      return false;\n' +
      '    }\n' +
      '  }\n' +
      '  return true;\n' +
      '}',
    hints: [
      'A return statement ends the function immediately, not just the current loop pass.',
      'Only one of the two answers can be decided from a single element. Which one?'
    ],
    explanation:
      'Because return ends the function on the very first iteration, the loop never reaches index 1. Only a counterexample can be decided early, so return false as soon as a non-positive number appears and return true after the loop has survived every element.',
    xpReward: 40,
    tags: ['return', 'loops', 'debugging']
  },
  {
    id: 'stage-1-b03',
    stageId: 'stage-1',
    title: 'Clean up a string',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Fill in the string methods so each comment describes what is printed.',
    codeSnippet:
      'const raw = "  hello world  ";\n' +
      'const clean = raw.___();\n' +
      'const shout = clean.___();\n' +
      'const words = clean.___(" ");\n' +
      'console.log(clean);        // hello world\n' +
      'console.log(shout);        // HELLO WORLD\n' +
      'console.log(words.length); // 2',
    blanks: [
      { answer: 'trim', choices: ['trim', 'strip', 'clean', 'trimAll'] },
      { answer: 'toUpperCase', choices: ['toUpperCase', 'toUpper', 'upperCase', 'upper'] },
      { answer: 'split', choices: ['split', 'slice', 'splice', 'divide'] }
    ],
    hints: [
      'Several of these names are borrowed from other languages, and two of the wrong ones are real JavaScript methods that do something else.',
      'The last one turns one string into an array of pieces around a separator.'
    ],
    explanation:
      'trim removes whitespace from both ends, toUpperCase returns an uppercased copy, and split cuts the string into an array around the separator. None of them change raw: strings are immutable, so every string method returns a new value.',
    xpReward: 40,
    tags: ['strings', 'methods', 'immutability']
  },
  {
    id: 'stage-1-b04',
    stageId: 'stage-1',
    title: 'Plus is not like minus',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'javascript',
    prompt: 'What are the four printed lines, in order?',
    codeSnippet:
      'console.log("5" + 3);\n' +
      'console.log("5" - 3);\n' +
      'console.log(Number("5") + 3);\n' +
      'console.log("5" * "2");',
    options: [
      '53, 2, 8, 10',
      '8, 2, 8, 10',
      '53, 2, 53, 10',
      '53, NaN, 8, NaN'
    ],
    correctIndex: 0,
    hints: [
      'Only one arithmetic operator in JavaScript is also the string concatenation operator.',
      'Number("5") produces a real number before the addition happens.'
    ],
    explanation:
      'The + operator concatenates as soon as either side is a string, so "5" + 3 is the text "53". The -, * and / operators have no string meaning, so they convert both sides to numbers first, which is why "5" - 3 is 2 and "5" * "2" is 10.',
    xpReward: 70,
    tags: ['type-conversion', 'coercion', 'operators']
  },
  {
    id: 'stage-1-b05',
    stageId: 'stage-1',
    title: 'Precedence with exponentiation',
    type: 'quiz',
    difficulty: 'hard',
    language: 'javascript',
    prompt: 'What value does this program print?',
    codeSnippet:
      'const base = 4;\n' +
      'const a = 2 + 3 * base ** 2 / 8;\n' +
      'console.log(a);',
    options: ['8', '10', '20', '50'],
    correctIndex: 0,
    hints: [
      'Four operators appear on that line, and they do not all have the same precedence.',
      'Work out which single operation runs first, then which two share a level and settle the tie left to right.'
    ],
    explanation:
      'Exponentiation runs first, giving 16. Then * and / run left to right: 3 * 16 is 48 and 48 / 8 is 6. Addition is last, so the result is 2 + 6 = 8. Reading the line strictly left to right instead would give 50.',
    xpReward: 110,
    tags: ['operators', 'precedence', 'arithmetic']
  },
  {
    id: 'stage-1-b06',
    stageId: 'stage-1',
    title: 'Complete the ternary',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'javascript',
    prompt: 'Fill in the two ternary operators so the printed values match the comments.',
    codeSnippet:
      'function statusOf(stock) {\n' +
      '  if (stock === 0) return "sold out";\n' +
      '  return stock < 10 ___ "low" ___ "in stock";\n' +
      '}\n' +
      'console.log(statusOf(0));   // sold out\n' +
      'console.log(statusOf(3));   // low\n' +
      'console.log(statusOf(50));  // in stock',
    blanks: [
      { answer: '?', choices: ['?', '&&', '=>', 'if'] },
      { answer: ':', choices: [':', '||', ';', 'else'] }
    ],
    hints: [
      'The conditional operator takes three parts: a test, a value for true, and a value for false.',
      'It is the only operator in JavaScript that uses two separate symbols.'
    ],
    explanation:
      'The conditional operator is written condition ? valueIfTrue : valueIfFalse and evaluates to one of the two values, so it can be returned directly. Unlike an if statement it is an expression, which is why it works inside a return.',
    xpReward: 40,
    tags: ['ternary', 'conditionals', 'expressions']
  },
  {
    id: 'stage-1-b07',
    stageId: 'stage-1',
    title: 'Calculator with a switch',
    type: 'code_runner',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Return the result of applying op to a and b. Support "+", "-", "*" and "/". Return null for any other operator and for division by zero.',
    starterCode:
      'function calculate(a, op, b) {\n' +
      '  // switch on op and return the right result\n' +
      '  return null;\n' +
      '}',
    entryFunction: 'calculate',
    testCases: [
      { input: '6, "+", 3', expected: '9' },
      { input: '6, "-", 3', expected: '3' },
      { input: '6, "*", 3', expected: '18' },
      { input: '6, "/", 3', expected: '2' },
      { input: '6, "/", 0', expected: 'null' },
      { input: '6, "^", 3', expected: 'null' }
    ],
    solutionCode:
      'function calculate(a, op, b) {\n' +
      '  switch (op) {\n' +
      '    case "+":\n' +
      '      return a + b;\n' +
      '    case "-":\n' +
      '      return a - b;\n' +
      '    case "*":\n' +
      '      return a * b;\n' +
      '    case "/":\n' +
      '      return b === 0 ? null : a / b;\n' +
      '    default:\n' +
      '      return null;\n' +
      '  }\n' +
      '}',
    hints: [
      'A case that returns needs no break, because return already leaves the function.',
      'default is the branch that catches every operator you did not list.'
    ],
    explanation:
      'switch compares op against each case with strict equality and runs from the first match onwards, so every branch needs a return or a break to stop fall-through. The default branch handles unknown operators, and division checks its divisor before dividing.',
    xpReward: 70,
    tags: ['switch', 'control-flow', 'functions']
  },
  {
    id: 'stage-1-b08',
    stageId: 'stage-1',
    title: 'Which strings say Total: 12 items',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'javascript',
    prompt:
      'Given the declaration below, which expressions evaluate to exactly the text "Total: 12 items"? Select every one that applies.',
    codeSnippet: 'const count = 12;',
    options: [
      '`Total: ${count} items`',
      '"Total: " + count + " items"',
      '`Total: {count} items`',
      '"Total: ${count} items"',
      '`Total: ${ count } items`',
      "'Total: ${count} items'"
    ],
    correctIndices: [0, 1, 4],
    hints: [
      'Interpolation only happens inside backticks, and the placeholder needs both a dollar sign and braces.',
      'Whitespace inside the braces is part of the expression, not part of the text.'
    ],
    explanation:
      'Only a backtick template literal interpolates, and only through the ${ } placeholder, so the quoted strings print the placeholder literally and the braces without a dollar sign are just characters. Spaces inside ${ } belong to the expression and vanish from the output, and ordinary concatenation still works fine.',
    xpReward: 70,
    tags: ['template-literals', 'strings', 'interpolation']
  },
  {
    id: 'stage-1-b09',
    stageId: 'stage-1',
    title: 'Order the safe parse',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt:
      'Put these pseudocode lines in the order that parses text and falls back to defaults when the text is invalid.',
    pseudocodeLines: [
      'TRY',
      '    SET data TO PARSE text AS JSON',
      'CATCH error',
      '    LOG "settings invalid: " + error.message',
      '    RETURN the default settings',
      'END TRY',
      'RETURN data'
    ],
    hints: [
      'Only the line that can actually throw belongs inside the TRY block.',
      'A RETURN ends the routine, so anything you want logged must come before it.'
    ],
    explanation:
      'The parse is the only line that can throw, so it is the only line guarded by TRY; if it fails, control jumps to CATCH with the error object. The recovery path logs before it returns the fallback, because a RETURN would end the routine before the log could run, and the success value is returned after END TRY - the one spot reached only when no error was raised.',
    xpReward: 70,
    tags: ['try-catch', 'error-handling', 'pseudocode']
  },
  {
    id: 'stage-1-b10',
    stageId: 'stage-1',
    title: 'Recursive palindrome check',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'Return true when the string reads the same forwards and backwards. Solve it recursively: compare the two ends, then check the middle. Empty and one-character strings are palindromes.',
    starterCode:
      'function isPalindrome(s) {\n' +
      '  // handle the base cases first, then recurse\n' +
      '  return false;\n' +
      '}',
    entryFunction: 'isPalindrome',
    testCases: [
      { input: '"racecar"', expected: 'true' },
      { input: '"abba"', expected: 'true' },
      { input: '"abca"', expected: 'false' },
      { input: '"a"', expected: 'true' },
      { input: '""', expected: 'true' },
      { input: '"ab"', expected: 'false' }
    ],
    solutionCode:
      'function isPalindrome(s) {\n' +
      '  if (s.length <= 1) return true;\n' +
      '  if (s[0] !== s[s.length - 1]) return false;\n' +
      '  return isPalindrome(s.slice(1, -1));\n' +
      '}',
    hints: [
      's.slice(1, -1) drops the first and last character at once.',
      'Every recursive call must move towards a shorter string, or the calls never stop.'
    ],
    explanation:
      'The base case stops the recursion when nothing is left to compare, which is why a string of length 0 or 1 answers true immediately. Each call decides one pair of characters and hands a strictly shorter string to the next call, so the input always shrinks towards the base case.',
    xpReward: 110,
    tags: ['recursion', 'strings', 'base-case']
  }
];
