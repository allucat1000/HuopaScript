import "io";

int a = 0;
int b = 1;
int c = 0;
int count = 0;

func void fib() { 
    if (count == 10) {
        return;
    }
    c = a + b;
    a = b;
    b = c;
    io.print(c);
    count += 1;
    fib();
}

fib();