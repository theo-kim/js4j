#!/usr/bin/env python3
"""
Comparison tests using py4j (Python implementation).

Runs the same operations as test_js4j.js and writes results to
comparison_results_py4j.json so they can be compared with js4j output.

Usage:
    python test_py4j.py [--gateway-port 25333] [--output results_py4j.json]
"""

import argparse
import json
import sys
import traceback

try:
    from py4j.java_gateway import JavaGateway, GatewayParameters
    from py4j.protocol import Py4JJavaError
except ImportError:
    print("ERROR: py4j is not installed. Run: pip install py4j", file=sys.stderr)
    sys.exit(1)


def run_test(name, fn, results):
    """Run a single test and record the result."""
    try:
        value = fn()
        results[name] = {"status": "ok", "value": value}
        print(f"  PASS  {name} => {value!r}")
    except Py4JJavaError as e:
        results[name] = {"status": "java_error", "value": str(e.java_exception)}
        print(f"  JAVA_ERR  {name}: {e.java_exception}")
    except Exception as e:
        results[name] = {"status": "error", "value": str(e)}
        print(f"  ERROR  {name}: {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gateway-port", type=int, default=25333)
    parser.add_argument("--output", default="comparison_results_py4j.json")
    args = parser.parse_args()

    gateway = JavaGateway(
        gateway_parameters=GatewayParameters(port=args.gateway_port)
    )
    ep = gateway.entry_point

    results = {}

    print("\n--- Arithmetic ---")
    run_test("add_int",       lambda: ep.add(3, 4),         results)
    run_test("add_negative",  lambda: ep.add(-10, 5),       results)
    run_test("add_doubles",   lambda: ep.addDoubles(1.5, 2.5), results)
    run_test("multiply",      lambda: ep.multiply(6, 7),    results)
    run_test("divide",        lambda: ep.divide(10.0, 4.0), results)

    print("\n--- Strings ---")
    run_test("greet",             lambda: ep.greet("World"),               results)
    run_test("concatenate",       lambda: ep.concatenate("foo", "bar"),    results)
    run_test("string_length",     lambda: ep.stringLength("hello"),        results)
    run_test("to_upper_case",     lambda: ep.toUpperCase("hello"),         results)
    run_test("contains_true",     lambda: ep.containsSubstring("foobar", "oba"), results)
    run_test("contains_false",    lambda: ep.containsSubstring("foobar", "xyz"), results)
    run_test("repeat_string",     lambda: ep.repeatString("ab", 3),       results)

    print("\n--- Booleans ---")
    run_test("and_true",  lambda: ep.andBool(True, True),  results)
    run_test("and_false", lambda: ep.andBool(True, False), results)
    run_test("or_true",   lambda: ep.orBool(False, True),  results)
    run_test("or_false",  lambda: ep.orBool(False, False), results)
    run_test("not_true",  lambda: ep.notBool(True),        results)
    run_test("not_false", lambda: ep.notBool(False),       results)

    print("\n--- Null handling ---")
    run_test("maybe_null_returns_null",  lambda: ep.maybeNull(True),  results)
    run_test("maybe_null_returns_str",   lambda: ep.maybeNull(False), results)

    print("\n--- Collections ---")
    run_test("list_size",  lambda: ep.getStringList().size(), results)
    run_test("list_get_0", lambda: ep.getStringList().get(0), results)
    run_test("list_get_2", lambda: ep.getStringList().get(2), results)

    run_test("int_list_get_0", lambda: ep.getIntList().get(0), results)
    run_test("int_list_get_4", lambda: ep.getIntList().get(4), results)
    run_test("int_list_size",  lambda: ep.getIntList().size(), results)

    run_test("set_size",    lambda: ep.getStringSet().size(),                     results)
    run_test("set_contains_one", lambda: ep.getStringSet().contains("one"),       results)
    run_test("set_contains_xxx", lambda: ep.getStringSet().contains("xxx"),       results)

    run_test("map_size",    lambda: ep.getStringIntMap().size(),                  results)
    run_test("map_get_a",   lambda: ep.getStringIntMap().get("a"),                results)
    run_test("map_get_c",   lambda: ep.getStringIntMap().get("c"),                results)
    run_test("map_contains_key_a",  lambda: ep.getStringIntMap().containsKey("a"), results)
    run_test("map_contains_key_z",  lambda: ep.getStringIntMap().containsKey("z"), results)

    print("\n--- Type round-trips ---")
    run_test("echo_int_pos",   lambda: ep.echoInt(42),        results)
    run_test("echo_int_neg",   lambda: ep.echoInt(-99),       results)
    run_test("echo_long",      lambda: ep.echoLong(10**12),   results)
    run_test("echo_double",    lambda: ep.echoDouble(3.14),   results)
    run_test("echo_bool_true", lambda: ep.echoBool(True),     results)
    run_test("echo_bool_false",lambda: ep.echoBool(False),    results)
    run_test("echo_string",    lambda: ep.echoString("js4j"), results)

    print("\n--- Counter object ---")
    run_test("counter_initial", lambda: ep.createCounter(10).getValue(),  results)
    run_test("counter_increment", lambda: (
        lambda c: (c.increment(), c.getValue())[1]
    )(ep.createCounter(5)),                                                results)
    run_test("counter_add", lambda: (
        lambda c: (c.add(7), c.getValue())[1]
    )(ep.createCounter(3)),                                                results)

    print("\n--- Exceptions ---")
    run_test("throw_exception", lambda: ep.throwException("boom"), results)
    run_test("divide_by_zero",  lambda: ep.divideInts(10, 0),      results)

    print("\n--- JVM namespace ---")
    jvm = gateway.jvm
    run_test("Math_abs",      lambda: jvm.java.lang.Math.abs(-42),     results)
    run_test("Math_max",      lambda: jvm.java.lang.Math.max(3, 7),    results)
    run_test("Math_min",      lambda: jvm.java.lang.Math.min(3, 7),    results)
    run_test("Math_PI",       lambda: float(jvm.java.lang.Math.PI),    results)
    run_test("Integer_MAX",   lambda: jvm.java.lang.Integer.MAX_VALUE, results)
    run_test("String_valueOf_int", lambda: jvm.java.lang.String.valueOf(123), results)

    print("\n--- StringBuilder (constructor via JVM) ---")
    run_test("stringbuilder_basic", lambda: (
        lambda sb: (sb.append(" World"), str(sb.toString()))[1]
    )(jvm.java.lang.StringBuilder("Hello")),                              results)

    print("\n--- ArrayList (constructor via JVM) ---")
    run_test("arraylist_add_size", lambda: (
        lambda lst: (lst.add("x"), lst.add("y"), lst.size())[2]
    )(jvm.java.util.ArrayList()),                                          results)

    gateway.close()

    # Serialise — convert Java/py4j types to plain Python types
    def serialise(v):
        if v is None:
            return None
        if isinstance(v, bool):
            return bool(v)
        if isinstance(v, int):
            return int(v)
        if isinstance(v, float):
            return float(v)
        return str(v)

    serialisable = {}
    for key, rec in results.items():
        serialisable[key] = {
            "status": rec["status"],
            "value": serialise(rec["value"]),
        }

    with open(args.output, "w") as f:
        json.dump(serialisable, f, indent=2)

    print(f"\nResults written to {args.output}")
    passed = sum(1 for r in results.values() if r["status"] == "ok")
    total = len(results)
    print(f"{passed}/{total} tests produced a result (errors are expected for exception tests)")


if __name__ == "__main__":
    main()
