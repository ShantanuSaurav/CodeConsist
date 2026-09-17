# app/routes

Route elements that need more than one module. `App.tsx` lazy-loads each of
these, so a screen that composes challenges + articles only downloads both
when someone opens it. A page that needs nothing from another module is
lazy-loaded straight from its module barrel and has no file here.

Composition happens by passing functions as props (`readingFor`,
`relatedFor`) - the modules still never import each other.
