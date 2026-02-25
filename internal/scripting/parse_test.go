package scripting

import (
	"strings"
	"testing"
)

func TestParseEditBlocks_SearchReplace(t *testing.T) {
	input := "hook_crypto.ts\n```typescript\n<<<<<<< SEARCH\n=======\nJava.perform(() => {});\n>>>>>>> REPLACE\n```\n"
	blocks := ParseEditBlocks(input)
	if len(blocks) != 1 {
		t.Fatalf("expected 1 block, got %d", len(blocks))
	}
	if blocks[0].Filename != "hook_crypto.ts" {
		t.Errorf("filename = %q", blocks[0].Filename)
	}
	if !blocks[0].IsNewFile() {
		t.Error("expected IsNewFile")
	}
	if blocks[0].Replace != "Java.perform(() => {});\n" {
		t.Errorf("replace = %q", blocks[0].Replace)
	}
}

func TestParseEditBlocks_BareCodeBlock(t *testing.T) {
	input := "Here's the script:\n\ntv4_spy.ts\n```typescript\nJava.perform(() => {\n  console.log(\"hello\");\n});\n```\n"
	blocks := ParseEditBlocks(input)
	if len(blocks) != 1 {
		t.Fatalf("expected 1 block, got %d", len(blocks))
	}
	if blocks[0].Filename != "tv4_spy.ts" {
		t.Errorf("filename = %q", blocks[0].Filename)
	}
	if !blocks[0].IsNewFile() {
		t.Error("expected IsNewFile")
	}
	want := "Java.perform(() => {\n  console.log(\"hello\");\n});\n"
	if blocks[0].Replace != want {
		t.Errorf("replace = %q, want %q", blocks[0].Replace, want)
	}
}

func TestParseEditBlocks_BareCodeBlockIgnoresSearchReplace(t *testing.T) {
	input := "hook.ts\n```typescript\n<<<<<<< SEARCH\nold line\n=======\nnew line\n>>>>>>> REPLACE\n```\n"
	blocks := ParseEditBlocks(input)
	if len(blocks) != 1 {
		t.Fatalf("expected 1 block, got %d", len(blocks))
	}
	if blocks[0].Search != "old line\n" {
		t.Errorf("search = %q", blocks[0].Search)
	}
	if blocks[0].Replace != "new line\n" {
		t.Errorf("replace = %q", blocks[0].Replace)
	}
}

func TestParseEditBlocks_NoFilename(t *testing.T) {
	input := "```typescript\nconsole.log('hi');\n```\n"
	blocks := ParseEditBlocks(input)
	if len(blocks) != 0 {
		t.Fatalf("expected 0 blocks, got %d", len(blocks))
	}
}

func TestParseEditBlocks_MultipleBlocks(t *testing.T) {
	input := "file_a.ts\n```typescript\n<<<<<<< SEARCH\n=======\ncode_a\n>>>>>>> REPLACE\n```\n\nfile_b.ts\n```typescript\ncode_b\n```\n"
	blocks := ParseEditBlocks(input)
	if len(blocks) != 2 {
		t.Fatalf("expected 2 blocks, got %d", len(blocks))
	}
	if blocks[0].Filename != "file_a.ts" {
		t.Errorf("block 0 filename = %q", blocks[0].Filename)
	}
	if blocks[1].Filename != "file_b.ts" {
		t.Errorf("block 1 filename = %q", blocks[1].Filename)
	}
}

func TestParseEditBlocks_IncrementalStability(t *testing.T) {
	part1 := "hook.ts\n```typescript\n<<<<<<< SEARCH\n=======\nconsole.log(1);\n>>>>>>> REPLACE\n```\n"
	part2 := "\nspy.ts\n```typescript\n<<<<<<< SEARCH\n=======\nconsole.log(2);\n>>>>>>> REPLACE\n```\n"

	blocks1 := ParseEditBlocks(part1)
	if len(blocks1) != 1 {
		t.Fatalf("after part1: expected 1 block, got %d", len(blocks1))
	}
	if blocks1[0].Filename != "hook.ts" {
		t.Errorf("block 0 filename = %q", blocks1[0].Filename)
	}

	blocks2 := ParseEditBlocks(part1 + part2)
	if len(blocks2) != 2 {
		t.Fatalf("after part1+part2: expected 2 blocks, got %d", len(blocks2))
	}

	if blocks2[0].Filename != blocks1[0].Filename || blocks2[0].Replace != blocks1[0].Replace {
		t.Error("block 0 changed between incremental parses")
	}
	if blocks2[1].Filename != "spy.ts" {
		t.Errorf("block 1 filename = %q", blocks2[1].Filename)
	}
}

func TestApplyEdits_MultipleBlocksSameFile(t *testing.T) {
	original := "func foo(a, b) {\n  return a + b;\n}\nfunc bar(x) {\n  return x;\n}\n"

	blocks := []EditBlock{
		{Filename: "test.ts", Search: "func foo(a, b) {\n", Replace: "func foo(a: any, b: any) {\n"},
		{Filename: "test.ts", Search: "func bar(x) {\n", Replace: "func bar(x: any) {\n"},
	}

	getContent := func(filename string) (string, bool) {
		if filename == "test.ts" {
			return original, true
		}
		return "", false
	}

	result := ApplyEdits(blocks, getContent)
	if len(result.Failed) != 0 {
		t.Fatalf("expected 0 failures, got %d", len(result.Failed))
	}
	if len(result.Applied) != 2 {
		t.Fatalf("expected 2 applied, got %d", len(result.Applied))
	}

	final := result.Applied[len(result.Applied)-1].NewContent
	if !strings.Contains(final, "a: any, b: any") {
		t.Error("first edit missing from final content")
	}
	if !strings.Contains(final, "x: any") {
		t.Error("second edit missing from final content")
	}
}

func TestParseEditBlocks_IncompleteBlockNotReturned(t *testing.T) {
	partial := "hook.ts\n```typescript\n<<<<<<< SEARCH\n=======\nconsole.log(1);\n"
	blocks := ParseEditBlocks(partial)
	if len(blocks) != 0 {
		t.Fatalf("incomplete block should not be returned, got %d blocks", len(blocks))
	}

	complete := partial + ">>>>>>> REPLACE\n```\n"
	blocks = ParseEditBlocks(complete)
	if len(blocks) != 1 {
		t.Fatalf("expected 1 block after completion, got %d", len(blocks))
	}
}
