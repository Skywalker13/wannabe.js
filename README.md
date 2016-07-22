
# Wannabe.js

**WIP**

1. Use `rowsExtractor` in order to extract all rows of a specific test.
2. Run **mocha** on the specified test and break on the first row.
3. Add breakpoints to all rows retrieved with `rowsExtractor`.
4. Continue to the next breakpoint and save the context in a map.
5. Loop on the point 4 until that mocha is ended.

Then we should have retrieved the context of all variables. It can be used in an atom module in order to print the results in the editor.