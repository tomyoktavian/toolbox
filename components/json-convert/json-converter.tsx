"use client"
import { useState } from "react"
import { Check, Copy, AlertCircle, Code, FileJson, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import CodeEditor from "@/components/json-convert/code-editor/Code-Editor";
import { generateTypeScript } from "@/lib/json-convert/typescript-converter"
import { generateJava } from "@/lib/json-convert/java-converter"
import { generateFlutter } from "@/lib/json-convert/flutter-converter"
import { generateSwift } from "@/lib/json-convert/swift-converter"

export function JsonConverter() {
  const [jsonInput, setJsonInput] = useState("")
  const [output, setOutput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState("typescript")
  const [copied, setCopied] = useState(false)
  const [rootName, setRootName] = useState("Root")
  const [isConverting, setIsConverting] = useState(false)

  const handleInputChange = (value: string) => {
    setJsonInput(value)
    setError(null)
  }

  const handleConvert = () => {
    try {
      if (!jsonInput.trim()) {
        setError("Please enter JSON data")
        setOutput("")
        return
      }

      if (!rootName.trim()) {
        setError("Root name is required")
        return
      }

      setIsConverting(true)

      // Small delay to show loading state
      setTimeout(() => {
        try {
          const parsedJson = JSON.parse(jsonInput)

          switch (language) {
            case "typescript":
              setOutput(generateTypeScript(parsedJson, rootName))
              break
            case "java":
              setOutput(generateJava(parsedJson, rootName))
              break
            case "flutter":
              setOutput(generateFlutter(parsedJson, rootName))
              break
            case "swift":
              setOutput(generateSwift(parsedJson, rootName))
              break
          }

          setError(null)
        } catch (err) {
          setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
          setOutput("")
        } finally {
          setIsConverting(false)
        }
      }, 300)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      setOutput("")
      setIsConverting(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatJson = () => {
    try {
      if (!jsonInput.trim()) {
        return
      }
      const parsedJson = JSON.parse(jsonInput)
      setJsonInput(JSON.stringify(parsedJson, null, 2))
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const getLanguageIcon = () => {
    switch (language) {
      case "typescript":
        return <Code className="h-5 w-5 text-blue-500" />
      case "java":
        return <Code className="h-5 w-5 text-amber-500" />
      case "flutter":
        return <Code className="h-5 w-5 text-emerald-500" />
      case "swift":
        return <Code className="h-5 w-5 text-orange-500" />
      default:
        return <Code className="h-5 w-5" />
    }
  }

  const getLanguageTitle = () => {
    switch (language) {
      case "typescript":
        return "TypeScript Interface"
      case "java":
        return "Java Class"
      case "flutter":
        return "Flutter Model"
      case "swift":
        return "Swift Struct"
      default:
        return "Generated Code"
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card className="shadow-lg border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-blue-500" />
            <CardTitle>JSON Input</CardTitle>
          </div>
          <CardDescription>Paste your JSON data to convert it into code</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="json-input" className="text-sm font-medium">
                JSON Data
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="outline" size="sm" onClick={formatJson} className="h-8" />}
                  >
                    Format JSON
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Format JSON with proper indentation</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="h-[300px] border rounded-md overflow-hidden shadow-sm">
              <CodeEditor
                value={jsonInput}
                onChange={handleInputChange}
                language="json"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Target Language</Label>
              <Tabs defaultValue="typescript" onValueChange={setLanguage} value={language} className="w-full">
                <div className="overflow-x-auto pb-1">
                  <TabsList className="inline-flex min-w-full whitespace-nowrap">
                    <TabsTrigger value="typescript" className="flex items-center gap-1">
                      <span className="hidden sm:inline">TypeScript</span>
                      <span className="sm:hidden">TS</span>
                    </TabsTrigger>
                    <TabsTrigger value="java" className="flex items-center gap-1">
                      <span className="hidden sm:inline">Java</span>
                      <span className="sm:hidden">Java</span>
                    </TabsTrigger>
                    <TabsTrigger value="flutter" className="flex items-center gap-1">
                      <span className="hidden sm:inline">Flutter</span>
                      <span className="sm:hidden">Flutter</span>
                    </TabsTrigger>
                    <TabsTrigger value="swift" className="flex items-center gap-1">
                      <span className="hidden sm:inline">Swift</span>
                      <span className="sm:hidden">Swift</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label htmlFor="root-name" className="text-sm font-medium">
                Root Name
              </Label>
              <Input
                id="root-name"
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                placeholder="Root name for generated code"
                className="h-9"
                required
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This will be used as the main class/interface name
              </p>
            </div>

            <Button onClick={handleConvert} className="w-full gap-2" disabled={isConverting}>
              {isConverting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                  Converting...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Convert
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {getLanguageIcon()}
            <CardTitle>{getLanguageTitle()}</CardTitle>
          </div>
          <CardDescription>Generated code based on your JSON input</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Generated Code</Label>
            {output && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        className="h-8 flex items-center gap-1"
                      />
                    }
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy code to clipboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <div className="h-[400px] border rounded-md overflow-hidden shadow-sm">
            {output ? (
              <CodeEditor
                value={output}
                language={language === "flutter" ? "dart" : language === "swift" ? "swift" : language}
                readOnly
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-slate-900">
                <div className="text-center">
                  <Code className="h-10 w-10 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
                  <p>Generated code will appear here</p>
                  <p className="text-xs mt-2">Convert your JSON to see the result</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
