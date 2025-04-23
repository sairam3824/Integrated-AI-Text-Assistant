from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import sys

tokenizer = AutoTokenizer.from_pretrained("google-t5/t5-small")
model = AutoModelForSeq2SeqLM.from_pretrained("google-t5/t5-small")

def summarize_text(text, max_length=50, min_length=10):
    input_ids = tokenizer.encode(text, return_tensors="pt")
    summary_ids = model.generate(input_ids, max_length=max_length, min_length=min_length, do_sample=False)
    summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
    return summary

if __name__ == '__main__':
    if len(sys.argv) > 1:
        text_to_summarize = sys.argv[1]
        summary = summarize_text(text_to_summarize)
        print(summary)
    else:
        print("Error: Text to summarize not provided as a command-line argument.")
        sys.exit(1)