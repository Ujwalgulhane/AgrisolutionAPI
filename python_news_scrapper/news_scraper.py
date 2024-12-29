import os
import requests
import json
from bs4 import BeautifulSoup
import traceback

def scrap_news():
    try:
        base_url = 'https://economictimes.indiatimes.com'
        url = 'https://economictimes.indiatimes.com/news/economy/agriculture'
        
        # Fetch HTML data
        html_data = requests.get(url)
        html_data.raise_for_status()  # Raise an error for HTTP request issues
        parse_data = BeautifulSoup(html_data.text, 'html.parser')
        
        # Find the section list
        section_list = parse_data.find(class_="section_list")
        if not section_list:
            raise ValueError("Section list not found on the page")
        
        each_story = section_list.find_all(class_="eachStory")
        story_with_image = {'stories': []}
        
        # Process each story
        for story in each_story:
            stories = {}
            link_tag = story.find('a', href=True)
            if link_tag and 'href' in link_tag.attrs:
                stories['story_end_point'] = link_tag['href']
            else:
                continue  # Skip stories without a valid link
            
            img_tag = story.find('img')
            if img_tag and 'src' in img_tag.attrs:
                stories['story_img'] = img_tag['src']
            else:
                stories['story_img'] = 'default_image_url_or_empty_string'  # Fallback image
            
            story_with_image['stories'].append(stories)
        
        final_news = {"agri_news": []}
        i = 0
        
        # Fetch detailed news for each story
        for story in story_with_image['stories']:
            print(f"Processing story {i + 1}")
            news = {}
            try:
                story_url = f"{base_url}{story['story_end_point']}"
                html_data = requests.get(story_url)
                html_data.raise_for_status()
                parse_data = BeautifulSoup(html_data.text, 'html.parser')
                
                # Extract news details
                heading = parse_data.find(class_='artTitle font_faus')
                if heading:
                    news['heading'] = heading.text.strip()
                else:
                    news['heading'] = "No title available"
                
                time_tag = parse_data.find("time")
                if time_tag:
                    news['updated_date_time'] = time_tag.text.strip()
                else:
                    news['updated_date_time'] = "No date available"
                
                article = parse_data.find('article')
                if article:
                    news_desc = article.find(class_='artText')
                    news['news_description'] = news_desc.text.strip() if news_desc else "No description available"
                else:
                    news['news_description'] = "No article content available"
                
                news['story_link'] = story_url
                news['story_img_url'] = story['story_img']
                final_news['agri_news'].append(news)
                i += 1
            except Exception as inner_exception:
                print(f"Error processing story {i + 1}: {inner_exception}")
                continue  # Skip to the next story
        
        # Save to JSON
        output_dir = '../assets'
        os.makedirs(output_dir, exist_ok=True)  # Ensure the directory exists
        output_file = os.path.join(output_dir, 'scrap_data.json')
        with open(output_file, "w") as file:
            json.dump(final_news, file, indent=4)
        
        print("News scraping completed successfully.")
        return 1
    except Exception as e:
        print("An error occurred:", e)
        traceback.print_exc()
        return 0

print(scrap_news())

