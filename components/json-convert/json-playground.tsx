"use client";
import { useState } from "react";
import { Check, Copy, AlertCircle, Code, FileJson, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import CodeEditor from "@/components/json-convert/code-editor/Code-Editor";
import { generateTypeScript } from "@/lib/json-convert/typescript-converter";
import { generateJava } from "@/lib/json-convert/java-converter";
import { generateFlutter } from "@/lib/json-convert/flutter-converter";
import { generateSwift } from "@/lib/json-convert/swift-converter";
import { generateGo } from "@/lib/json-convert/go-converter";
import { generateKotlin } from "@/lib/json-convert/kotlin-converter";

export function JsonPlayground() {
  const [jsonInput, setJsonInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("typescript");
  const [copied, setCopied] = useState(false);
  const [rootName, setRootName] = useState("Root");
  const [isConverting, setIsConverting] = useState(false);

  const handleInputChange = (value: string) => {
    setJsonInput(value);
    setError(null);
  };

  const handleConvert = (targetLanguage?: string) => {
    try {
      const langToUse = targetLanguage || language;

      if (!jsonInput.trim()) {
        setError("Please enter JSON data");
        setOutput("");
        return;
      }

      if (!rootName.trim()) {
        setError("Root name is required");
        return;
      }

      setIsConverting(true);

      // Small delay to show loading state
      setTimeout(() => {
        try {
          const parsedJson = JSON.parse(jsonInput);

          switch (langToUse) {
            case "typescript":
              setOutput(generateTypeScript(parsedJson, rootName));
              break;
            case "java":
              setOutput(generateJava(parsedJson, rootName));
              break;
            case "flutter":
              setOutput(generateFlutter(parsedJson, rootName));
              break;
            case "swift":
              setOutput(generateSwift(parsedJson, rootName));
              break;
            case "go":
              setOutput(generateGo(parsedJson, rootName));
              break;
            case "kotlin":
              setOutput(generateKotlin(parsedJson, rootName));
              break;
          }

          setError(null);
        } catch (err) {
          setError(
            `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          );
          setOutput("");
        } finally {
          setIsConverting(false);
        }
      }, 300);
    } catch (err) {
      setError(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      setOutput("");
      setIsConverting(false);
    }
  };

  // Handle language change and automatically convert
  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    if (jsonInput.trim() && rootName.trim()) {
      handleConvert(newLanguage);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatJson = () => {
    try {
      if (!jsonInput.trim()) {
        return;
      }
      const parsedJson = JSON.parse(jsonInput);
      setJsonInput(JSON.stringify(parsedJson, null, 2));
    } catch (err) {
      setError(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const getLanguageIcon = () => {
    switch (language) {
      case "typescript":
        return <Code className="h-5 w-5 text-blue-500" />;
      case "java":
        return <Code className="h-5 w-5 text-amber-500" />;
      case "flutter":
        return <Code className="h-5 w-5 text-emerald-500" />;
      case "swift":
        return <Code className="h-5 w-5 text-orange-500" />;
      case "go":
        return <Code className="h-5 w-5 text-cyan-500" />;
      case "kotlin":
        return <Code className="h-5 w-5 text-purple-500" />;
      default:
        return <Code className="h-5 w-5" />;
    }
  };

  const getLanguageTitle = () => {
    switch (language) {
      case "typescript":
        return "TypeScript";
      case "java":
        return "Java";
      case "flutter":
        return "Flutter";
      case "swift":
        return "Swift";
      case "go":
        return "Go";
      case "kotlin":
        return "Kotlin";
      default:
        return "Code";
    }
  };

  // Create language tabs based on screen size
  const renderLanguageTabs = () => {
    return (
      <Tabs
        defaultValue="typescript"
        onValueChange={handleLanguageChange}
        value={language}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 h-8">
          <TabsTrigger value="typescript" className="text-xs px-0">
            TS
          </TabsTrigger>
          <TabsTrigger value="java" className="text-xs px-0">
            Java
          </TabsTrigger>
          <TabsTrigger value="flutter" className="text-xs px-0">
            Flutter
          </TabsTrigger>
          <TabsTrigger value="swift" className="text-xs px-0">
            Swift
          </TabsTrigger>
          <TabsTrigger value="go" className="text-xs px-0">
            Go
          </TabsTrigger>
          <TabsTrigger value="kotlin" className="text-xs px-0">
            Kotlin
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
  };

  // Render desktop controls
  const renderDesktopControls = () => {
    return (
      <div className="p-4 bg-background border-b">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="root-name-desktop" className="text-xs font-medium">
              Root Name
            </Label>
            <Input
              id="root-name-desktop"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="Root name"
              className="h-9"
              required
            />
          </div>

          <div className="flex-1 space-y-1">
            <Label className="text-xs font-medium">Target Language</Label>
            {renderLanguageTabs()}
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => handleConvert()}
              className="h-9 w-full sm:w-auto gap-1"
              disabled={isConverting}
            >
              {isConverting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="text-sm">Converting...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  <span className="text-sm">Convert</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-3 py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs">Error</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full">
      {/* Desktop Controls - Only visible on desktop */}
      <div className="hidden md:block">{renderDesktopControls()}</div>

      {/* Main content - adjust padding bottom on mobile to account for bottom controls */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden pb-[100px] md:pb-0">
        {/* Left panel - JSON Input */}
        <div className="w-full lg:w-1/2 h-1/2 lg:h-full flex flex-col border-r">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-blue-500" />
              <span className="font-medium">JSON Input</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={formatJson}
              className="h-8"
            >
              Format JSON
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              value={jsonInput}
              onChange={handleInputChange}
              language="json"
            />
          </div>
        </div>

        {/* Right panel - Output */}
        <div className="w-full lg:w-1/2 h-1/2 lg:h-full flex flex-col">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              {getLanguageIcon()}
              <span className="font-medium">{getLanguageTitle()} Output</span>
            </div>
            {output && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                className="h-8 flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span className="text-xs">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span className="text-xs">Copy</span>
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {output ? (
              <CodeEditor
                value={output}
                language={
                  language === "flutter"
                    ? "dart"
                    : language === "swift"
                      ? "swift"
                      : language === "go"
                        ? "go"
                        : language === "kotlin"
                          ? "kotlin"
                          : language
                }
                readOnly
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground p-4 bg-muted/30">
                <div className="text-center">
                  <Code className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="text-sm">Generated code will appear here</p>
                  <p className="text-xs mt-1">
                    Convert your JSON to see the result
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile bottom controls - only visible on mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t p-3 z-10">
        <div className="grid grid-cols-1 gap-2 mb-2">
          <div className="space-y-1">
            <Label htmlFor="root-name-mobile" className="text-xs font-medium">
              Root Name
            </Label>
            <Input
              id="root-name-mobile"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="Root name"
              className="h-8"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Target Language</Label>
            {renderLanguageTabs()}
          </div>
        </div>

        <Button
          onClick={() => handleConvert()}
          className="w-full gap-1 h-9"
          disabled={isConverting}
        >
          {isConverting ? (
            <>
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span>Converting...</span>
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              <span>Convert</span>
            </>
          )}
        </Button>

        {error && (
          <Alert variant="destructive" className="mt-2 py-1">
            <AlertCircle className="h-3 w-3" />
            <AlertTitle className="text-xs">Error</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
