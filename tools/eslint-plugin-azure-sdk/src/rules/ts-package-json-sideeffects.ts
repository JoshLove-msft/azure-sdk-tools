/**
 * @file Rule to force package.json's sideEffects value to be set to false.
 * @author Arpan Laha
 */

import { Rule } from "eslint";
import { getRuleMetaData, getVerifiers, stripPath } from "../utils";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

export = {
  meta: getRuleMetaData(
    "ts-package-json-sideeffects",
    "force package.json's sideEffects value to be false",
    "code"
  ),
  create: (context: Rule.RuleContext): Rule.RuleListener => {
    const verifiers = getVerifiers(context, {
      outer: "sideEffects",
      expected: false
    });
    return stripPath(context.getFilename()) === "package.json"
      ? ({
          // callback functions

          // check to see if sideEffects exists at the outermost level
          "ExpressionStatement > ObjectExpression": verifiers.existsInFile,

          // check the node corresponding to sideEffects to see if its value is false
          "ExpressionStatement > ObjectExpression > Property[key.value='sideEffects']":
            verifiers.outerMatchesExpected
        } as Rule.RuleListener)
      : {};
  }
};
