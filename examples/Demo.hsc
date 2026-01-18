import "io";
import "time";
import "keyboard";
import "process";
import "fetch";
import "json";

func void numbers() {

	string bleh = "2";
	float grah = bleh.toNumber();

	int frr = 1;
	string yum = frr.toString();

	io.println("string to number: " + (grah + 1));
	io.println("int to string: " + (yum + "a"));

	float perf = time.epochNow();

	// int stuff

	int a = 2147483649;
	
	uint b = -1;

	io.println("32bit signed overflow: " + a);
	io.println("32bit unsigned underflow: " + b);

	// float stuff

	float c = 0.1 + 0.2;

	io.println("floating point accuracy issue: " + c);

	io.println("performance: " + (time.epochNow() - perf) + "ms");

}

func void text() {
	keyboard.enableRaw();
	string text = "";
	int lastChar = 0;

	while (lastChar != 13) {
		int char = keyboard.getChar();
		string s = keyboard.charToKey(char);
		if (char != 0) {
			io.clear();
			if (char == 127) {
				text = text.slice(0, -1);
			}
			lastChar = char;
			text += s;
			io.print(text);
		}
		await time.sleep(10);
	}
	keyboard.disableRaw();
}

func void fetching() {
	object data = await fetch.get("https://example.com");
	string page = data.text;
	io.println("example.com html: " + page);
}

func void objects() {

	object<string> obj = { "hi": "epic" };
	const string val = obj.hi;

	io.println("object value: " + val);

	array<string> arr = ["blehh"];
	string arrVal = arr.0;

	io.println("array value: " + arrVal);

	arr = ["hi"];
	arrVal = arr.0;

	io.println("arr reassignment: " + arrVal);

	string arrayString = "[\"1\"]";

	arr = json.parse(arrayString);

	io.println("array loaded from string (stringified for log): " + json.stringify(arr));

	object<object<string>> nestedobj = { "hello": { "hi": "yay" } };

	io.println("nested object: " + json.stringify(nestedobj));

	io.println("nested object value: " + nestedobj.hello.hi);

	arr.push("hi");

	io.println("array with new item 'hi': " + json.stringify(arr));

	io.println("object entries: " + obj.entries());
	
}

func void fib() {

	int a = 0;
	int b = 1;
	int c = 0;
	int count = 0;

	while (count < 10) {
		c = a + b;
		a = b;
		b = c;
		count += 1;
	}

	io.println("fib 10x res: " + c);

}

numbers();

fib();

objects();

await fetching();

await time.sleep(3000);

await text();

process.exit(0);