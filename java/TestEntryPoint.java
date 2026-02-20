import java.util.*;
import py4j.GatewayServer;

/**
 * TestEntryPoint — the Java-side entry point object exposed to both py4j and js4j clients.
 *
 * All methods here are exercised by both the Python and JavaScript comparison tests.
 * Results must be identical between the two client implementations.
 */
public class TestEntryPoint {

    // ------------------------------------------------------------------
    // Arithmetic
    // ------------------------------------------------------------------

    public int add(int a, int b) {
        return a + b;
    }

    public double addDoubles(double a, double b) {
        return a + b;
    }

    public long addLongs(long a, long b) {
        return a + b;
    }

    public int multiply(int a, int b) {
        return a * b;
    }

    public double divide(double a, double b) {
        return a / b;
    }

    // ------------------------------------------------------------------
    // Strings
    // ------------------------------------------------------------------

    public String greet(String name) {
        return "Hello, " + name + "!";
    }

    public String concatenate(String a, String b) {
        return a + b;
    }

    public int stringLength(String s) {
        return s.length();
    }

    public String toUpperCase(String s) {
        return s.toUpperCase();
    }

    public boolean containsSubstring(String haystack, String needle) {
        return haystack.contains(needle);
    }

    public String repeatString(String s, int times) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < times; i++) sb.append(s);
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // Booleans
    // ------------------------------------------------------------------

    public boolean andBool(boolean a, boolean b) {
        return a && b;
    }

    public boolean orBool(boolean a, boolean b) {
        return a || b;
    }

    public boolean notBool(boolean a) {
        return !a;
    }

    // ------------------------------------------------------------------
    // Null handling
    // ------------------------------------------------------------------

    public String maybeNull(boolean returnNull) {
        return returnNull ? null : "not null";
    }

    public boolean isNull(Object obj) {
        return obj == null;
    }

    // ------------------------------------------------------------------
    // Collections — returns wrapped Java collections
    // ------------------------------------------------------------------

    public List<String> getStringList() {
        List<String> list = new ArrayList<>();
        list.add("alpha");
        list.add("beta");
        list.add("gamma");
        return list;
    }

    public List<Integer> getIntList() {
        List<Integer> list = new ArrayList<>();
        list.add(1);
        list.add(2);
        list.add(3);
        list.add(4);
        list.add(5);
        return list;
    }

    public Set<String> getStringSet() {
        Set<String> set = new LinkedHashSet<>();
        set.add("one");
        set.add("two");
        set.add("three");
        return set;
    }

    public Map<String, Integer> getStringIntMap() {
        Map<String, Integer> map = new LinkedHashMap<>();
        map.put("a", 1);
        map.put("b", 2);
        map.put("c", 3);
        return map;
    }

    public int sumList(List<Integer> list) {
        int total = 0;
        for (int v : list) total += v;
        return total;
    }

    public int listSize(List<?> list) {
        return list.size();
    }

    // ------------------------------------------------------------------
    // Arrays
    // ------------------------------------------------------------------

    public int[] getIntArray() {
        return new int[]{10, 20, 30, 40, 50};
    }

    public String[] getStringArray() {
        return new String[]{"x", "y", "z"};
    }

    public int sumArray(int[] arr) {
        int total = 0;
        for (int v : arr) total += v;
        return total;
    }

    // ------------------------------------------------------------------
    // Exceptions
    // ------------------------------------------------------------------

    public void throwException(String message) {
        throw new RuntimeException(message);
    }

    public int divideInts(int a, int b) {
        return a / b;  // throws ArithmeticException on b=0
    }

    // ------------------------------------------------------------------
    // Object creation (returns instances of inner classes)
    // ------------------------------------------------------------------

    public Counter createCounter(int initial) {
        return new Counter(initial);
    }

    public static class Counter {
        private int value;

        public Counter(int initial) {
            this.value = initial;
        }

        public void increment() { value++; }
        public void decrement() { value--; }
        public void add(int n) { value += n; }
        public int getValue() { return value; }
        public void reset() { value = 0; }

        @Override
        public String toString() {
            return "Counter(" + value + ")";
        }
    }

    // ------------------------------------------------------------------
    // StringBuilder (tests creating Java objects from the client side)
    // ------------------------------------------------------------------

    public String buildString(String initial, String[] parts) {
        StringBuilder sb = new StringBuilder(initial);
        for (String p : parts) sb.append(p);
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // Type round-trips (verify encoding/decoding symmetry)
    // ------------------------------------------------------------------

    public int echoInt(int v) { return v; }
    public long echoLong(long v) { return v; }
    public double echoDouble(double v) { return v; }
    public boolean echoBool(boolean v) { return v; }
    public String echoString(String v) { return v; }
    public byte[] echoBytes(byte[] v) { return v; }

    // ------------------------------------------------------------------
    // Varargs
    // ------------------------------------------------------------------

    public int sumVarargs(int... values) {
        int total = 0;
        for (int v : values) total += v;
        return total;
    }

    public String joinStrings(String sep, String... parts) {
        return String.join(sep, parts);
    }

    // ------------------------------------------------------------------
    // Static access demo (via jvm namespace)
    // ------------------------------------------------------------------

    // These are tested via gateway.jvm.java.lang.Math.abs(-5) etc.
    // Nothing needed here; tests exercise the JVM directly.

    // ------------------------------------------------------------------
    // Main — starts the GatewayServer
    // ------------------------------------------------------------------

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 25333;
        TestEntryPoint entryPoint = new TestEntryPoint();
        GatewayServer server = new GatewayServer(entryPoint, port);
        server.start();
        // Signal readiness to the test harness
        System.out.println("GATEWAY_STARTED:" + server.getListeningPort());
        System.out.flush();

        // Keep alive until stdin is closed (test harness closes it on teardown)
        try {
            while (System.in.read() != -1) {}
        } catch (Exception e) {
            // ignore
        }
        server.shutdown();
    }
}
