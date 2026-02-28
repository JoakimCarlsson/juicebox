package chat

import (
	"errors"
	"strings"
	"testing"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type mockFileGetter struct {
	files map[string]*scripting.ScriptFile
	err   error
}

func (m *mockFileGetter) Get(
	deviceID, name string,
) (*scripting.ScriptFile, error) {
	if m.err != nil {
		return nil, m.err
	}
	f, ok := m.files[name]
	if !ok {
		return nil, nil
	}
	return f, nil
}

type mockCompiler struct {
	failFor map[string]string
}

func (m *mockCompiler) CompileScript(
	code string,
) (*bridge.CompileResult, error) {
	if msg, ok := m.failFor[code]; ok {
		return nil, errors.New(msg)
	}
	return &bridge.CompileResult{Success: true}, nil
}

func TestEditApplier_ScriptFiles_FiltersExtensions(t *testing.T) {
	ea := &editApplier{}
	ea.modifiedFiles = []string{
		"bypass.ts",
		"readme.md",
		"logger.js",
		"config.json",
		"com.example/hook.ts",
	}

	got := ea.scriptFiles()
	want := []string{"bypass.ts", "logger.js", "com.example/hook.ts"}

	if len(got) != len(want) {
		t.Fatalf("got %d scripts, want %d: %v", len(got), len(want), got)
	}
	for i, g := range got {
		if g != want[i] {
			t.Errorf("scriptFiles()[%d] = %q, want %q", i, g, want[i])
		}
	}
}

func TestEditApplier_ScriptFiles_Deduplicates(t *testing.T) {
	ea := &editApplier{}
	ea.modifiedFiles = []string{
		"bypass.ts",
		"bypass.ts",
		"logger.js",
		"bypass.ts",
	}

	got := ea.scriptFiles()
	if len(got) != 2 {
		t.Fatalf("got %d scripts, want 2: %v", len(got), got)
	}
	if got[0] != "bypass.ts" || got[1] != "logger.js" {
		t.Errorf("got %v", got)
	}
}

func TestEditApplier_ScriptFiles_EmptyWhenNoScripts(t *testing.T) {
	ea := &editApplier{}
	ea.modifiedFiles = []string{"readme.md", "config.json"}

	got := ea.scriptFiles()
	if len(got) != 0 {
		t.Fatalf("expected empty, got %v", got)
	}
}

func TestEditApplier_ScriptFiles_NilModifiedFiles(t *testing.T) {
	ea := &editApplier{}
	got := ea.scriptFiles()
	if got != nil {
		t.Fatalf("expected nil, got %v", got)
	}
}

func TestEditApplier_Reset(t *testing.T) {
	ea := &editApplier{
		buf:           "some content",
		applied:       5,
		modifiedFiles: []string{"a.ts", "b.js"},
	}

	ea.reset()

	if ea.buf != "" {
		t.Errorf("buf = %q, want empty", ea.buf)
	}
	if ea.applied != 0 {
		t.Errorf("applied = %d, want 0", ea.applied)
	}
	if ea.modifiedFiles != nil {
		t.Errorf("modifiedFiles = %v, want nil", ea.modifiedFiles)
	}
}

func TestCompileModifiedScripts_AllPass(t *testing.T) {
	fm := &mockFileGetter{
		files: map[string]*scripting.ScriptFile{
			"bypass.ts": {Content: "Java.perform(() => {});"},
			"logger.js": {Content: "console.log('ok');"},
		},
	}
	bc := &mockCompiler{failFor: map[string]string{}}

	result := compileModifiedScripts(
		bc,
		fm,
		"device-1",
		[]string{"bypass.ts", "logger.js"},
	)
	if result != "" {
		t.Errorf("expected empty, got %q", result)
	}
}

func TestCompileModifiedScripts_OneFails(t *testing.T) {
	fm := &mockFileGetter{
		files: map[string]*scripting.ScriptFile{
			"bypass.ts": {Content: "broken("},
			"logger.js": {Content: "console.log('ok');"},
		},
	}
	bc := &mockCompiler{
		failFor: map[string]string{
			"broken(": "SyntaxError: unexpected token",
		},
	}

	result := compileModifiedScripts(
		bc,
		fm,
		"device-1",
		[]string{"bypass.ts", "logger.js"},
	)
	if result == "" {
		t.Fatal("expected error message, got empty")
	}
	if !strings.Contains(result, "**bypass.ts**") {
		t.Errorf("expected bypass.ts in error, got %q", result)
	}
	if !strings.Contains(result, "SyntaxError") {
		t.Errorf("expected SyntaxError in error, got %q", result)
	}
	if strings.Contains(result, "logger.js") {
		t.Errorf("logger.js should not appear in errors, got %q", result)
	}
}

func TestCompileModifiedScripts_MultipleFail(t *testing.T) {
	fm := &mockFileGetter{
		files: map[string]*scripting.ScriptFile{
			"a.ts": {Content: "bad1"},
			"b.ts": {Content: "bad2"},
		},
	}
	bc := &mockCompiler{
		failFor: map[string]string{
			"bad1": "error in a",
			"bad2": "error in b",
		},
	}

	result := compileModifiedScripts(
		bc,
		fm,
		"device-1",
		[]string{"a.ts", "b.ts"},
	)
	if !strings.Contains(result, "**a.ts**") ||
		!strings.Contains(result, "**b.ts**") {
		t.Errorf("expected both filenames in error, got %q", result)
	}
	if !strings.HasPrefix(result, "Script compilation failed.") {
		t.Errorf("expected prefix, got %q", result)
	}
}

func TestCompileModifiedScripts_FileNotFound(t *testing.T) {
	fm := &mockFileGetter{
		files: map[string]*scripting.ScriptFile{},
	}
	bc := &mockCompiler{failFor: map[string]string{}}

	result := compileModifiedScripts(bc, fm, "device-1", []string{"missing.ts"})
	if result != "" {
		t.Errorf("expected empty for missing file, got %q", result)
	}
}

func TestCompileModifiedScripts_FileGetError(t *testing.T) {
	fm := &mockFileGetter{
		err: errors.New("db error"),
	}
	bc := &mockCompiler{failFor: map[string]string{}}

	result := compileModifiedScripts(bc, fm, "device-1", []string{"bypass.ts"})
	if result != "" {
		t.Errorf("expected empty when Get fails, got %q", result)
	}
}

func TestCompileModifiedScripts_EmptyFilenames(t *testing.T) {
	fm := &mockFileGetter{}
	bc := &mockCompiler{}

	result := compileModifiedScripts(bc, fm, "device-1", nil)
	if result != "" {
		t.Errorf("expected empty for nil filenames, got %q", result)
	}

	result = compileModifiedScripts(bc, fm, "device-1", []string{})
	if result != "" {
		t.Errorf("expected empty for empty filenames, got %q", result)
	}
}

func TestAutoLintPrefix_Filtering(t *testing.T) {
	tests := []struct {
		input string
		match bool
	}{
		{autoLintPrefix + "Script compilation failed", true},
		{autoLintPrefix, true},
		{"write a bypass script", false},
		{"", false},
		{"[auto-lint]no space", false},
	}

	for _, tt := range tests {
		got := strings.HasPrefix(tt.input, autoLintPrefix)
		if got != tt.match {
			t.Errorf(
				"HasPrefix(%q, autoLintPrefix) = %v, want %v",
				tt.input,
				got,
				tt.match,
			)
		}
	}
}

func TestMaxLintRetries_Bounds(t *testing.T) {
	if maxLintRetries < 1 {
		t.Fatal("maxLintRetries must be at least 1")
	}
	if maxLintRetries > 10 {
		t.Fatal("maxLintRetries should be reasonable (<=10)")
	}
}
