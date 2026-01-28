import "io";
import "time";

float perf = time.epochNow();

int a = 0;
int b = 1;
int c = 0;
int count = 0;

while (count < 10) {
    c = a + b;
    a = b;
    b = c;
    io.println(c);
    count += 1;
}

io.println("took: " + (time.epochNow() - perf) + "ms");