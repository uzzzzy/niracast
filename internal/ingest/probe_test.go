package ingest

import "testing"

const sampleProbeJSON = `{
 "streams": [
  {"index":0,"codec_name":"aac","codec_type":"audio","sample_rate":"44100"},
  {"index":1,"codec_name":"h264","codec_type":"video","width":1920,"height":1080,"duration":"120.000000"},
  {"index":2,"codec_name":"hevc","codec_type":"video","width":640,"height":360}
 ],
 "format": {"filename":"x.mp4","duration":"120.533000"}
}`

func TestProbeParse(t *testing.T) {
	md, err := parseProbeOutput("x.mp4", []byte(sampleProbeJSON))
	if err != nil {
		t.Fatal(err)
	}
	if md.Path != "x.mp4" || md.DurationSec != 120.533 || md.VideoCodec != "h264" ||
		md.AudioCodec != "aac" || md.Width != 1920 || md.Height != 1080 {
		t.Fatalf("unexpected metadata: %+v", md)
	}
}

func TestProbeParseNoStreams(t *testing.T) {
	md, err := parseProbeOutput("a", []byte(`{"streams":[],"format":{}}`))
	if err != nil || md.VideoCodec != "" || md.DurationSec != 0 {
		t.Fatalf("got %+v, %v", md, err)
	}
}

func TestProbeParseInvalid(t *testing.T) {
	if _, err := parseProbeOutput("a", []byte(`not json`)); err == nil {
		t.Fatal("expected error")
	}
	if _, err := parseProbeOutput("a", []byte(`{"format":{"duration":"abc"}}`)); err == nil {
		t.Fatal("expected duration error")
	}
}

func TestProbeMissingFile(t *testing.T) {
	if _, err := ProbeMedia("definitely-missing-file.mp4"); err == nil {
		t.Fatal("expected error")
	}
}
